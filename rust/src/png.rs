use crate::errors::CompressorError;

fn apply_resize(image: image::DynamicImage, mode: &str, value: u32) -> image::DynamicImage {
    match mode {
        "percentage" => {
            let scale = value as f32 / 100.0;
            if scale >= 1.0 {
                return image;
            }
            let new_width = (image.width() as f32 * scale).round() as u32;
            let new_height = (image.height() as f32 * scale).round() as u32;
            image.resize(new_width, new_height, image::imageops::FilterType::Lanczos3)
        }
        "maxWidth" => {
            if image.width() <= value {
                return image;
            }
            let scale = value as f32 / image.width() as f32;
            let new_height = (image.height() as f32 * scale).round() as u32;
            image.resize(value, new_height, image::imageops::FilterType::Lanczos3)
        }
        "maxHeight" => {
            if image.height() <= value {
                return image;
            }
            let scale = value as f32 / image.height() as f32;
            let new_width = (image.width() as f32 * scale).round() as u32;
            image.resize(new_width, value, image::imageops::FilterType::Lanczos3)
        }
        "fixed" => {
            // 按比例缩放到指定宽度
            let aspect_ratio = image.height() as f32 / image.width() as f32;
            let new_height = (value as f32 * aspect_ratio).round() as u32;
            image.resize(value, new_height, image::imageops::FilterType::Lanczos3)
        }
        _ => image,
    }
}

pub fn compress_png(
    data: &[u8],
    quality: u8,
    dithering: bool,
    resize_mode: &str,
    resize_value: u32,
    _auto_rotate: bool, // PNG 通常不包含 EXIF，保留参数以统一接口
) -> Result<Vec<u8>, CompressorError> {
    let image = image::load_from_memory(data)?;
    let image = apply_resize(image, resize_mode, resize_value);
    // 注意：image 库在加载时已经自动应用了 EXIF 方向（如果存在）
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();

    let mut attr = imagequant::new();
    let max_quality = quality;
    let min_quality = max_quality.saturating_sub(10);
    attr.set_quality(min_quality, max_quality)
        .map_err(|err| CompressorError::EncodeError(err.to_string()))?;
    attr.set_speed(3)
        .map_err(|err| CompressorError::EncodeError(err.to_string()))?;

    let pixels: Vec<imagequant::RGBA> = rgba
        .as_raw()
        .chunks_exact(4)
        .map(|chunk| imagequant::RGBA {
            r: chunk[0],
            g: chunk[1],
            b: chunk[2],
            a: chunk[3],
        })
        .collect();

    let mut img = attr
        .new_image(pixels, width as usize, height as usize, 0.0)
        .map_err(|err| CompressorError::EncodeError(err.to_string()))?;

    let mut res = attr
        .quantize(&mut img)
        .map_err(|err| CompressorError::EncodeError(err.to_string()))?;

    res.set_dithering_level(if dithering { 1.0 } else { 0.0 })
        .map_err(|err| CompressorError::EncodeError(err.to_string()))?;

    let (palette, pixels) = res
        .remapped(&mut img)
        .map_err(|err| CompressorError::EncodeError(err.to_string()))?;

    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, width, height);
        encoder.set_color(png::ColorType::Indexed);
        encoder.set_depth(png::BitDepth::Eight);

        let mut palette_bytes = Vec::with_capacity(palette.len() * 3);
        let mut trns = Vec::with_capacity(palette.len());
        let mut has_alpha = false;

        for color in &palette {
            palette_bytes.push(color.r);
            palette_bytes.push(color.g);
            palette_bytes.push(color.b);
            trns.push(color.a);
            if color.a < 255 {
                has_alpha = true;
            }
        }

        encoder.set_palette(palette_bytes);
        if has_alpha {
            encoder.set_trns(trns);
        }

        let mut writer = encoder.write_header()?;
        writer.write_image_data(&pixels)?;
    }

    Ok(out)
}
