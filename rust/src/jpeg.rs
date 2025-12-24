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
            let aspect_ratio = image.height() as f32 / image.width() as f32;
            let new_height = (value as f32 * aspect_ratio).round() as u32;
            image.resize(value, new_height, image::imageops::FilterType::Lanczos3)
        }
        _ => image,
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub fn compress_jpeg(
    data: &[u8],
    quality: u8,
    progressive: bool,
    resize_mode: &str,
    resize_value: u32,
) -> Result<Vec<u8>, CompressorError> {
    let image = image::load_from_memory(data)?;
    let image = apply_resize(image, resize_mode, resize_value);
    let rgb = image.to_rgb8();
    let (width, height) = rgb.dimensions();

    let mut comp = mozjpeg::Compress::new(mozjpeg::ColorSpace::JCS_RGB);
    comp.set_size(width as usize, height as usize);
    comp.set_quality(quality as f32);
    comp.set_mem_dest();
    if progressive {
        comp.set_progressive_mode();
    }

    let mut comp = comp
        .start_compress(Vec::new())
        .map_err(|err| CompressorError::EncodeError(err.to_string()))?;

    let row_stride = (width * 3) as usize;
    let raw = rgb.into_raw();

    for row in raw.chunks(row_stride) {
        comp.write_scanlines(row)
            .map_err(|err| CompressorError::EncodeError(err.to_string()))?;
    }

    let jpeg_data = comp
        .finish_compress()
        .map_err(|err| CompressorError::EncodeError(err.to_string()))?;
    Ok(jpeg_data)
}

#[cfg(target_arch = "wasm32")]
pub fn compress_jpeg(
    data: &[u8],
    quality: u8,
    _progressive: bool,
    resize_mode: &str,
    resize_value: u32,
) -> Result<Vec<u8>, CompressorError> {
    let image = image::load_from_memory(data)?;
    let image = apply_resize(image, resize_mode, resize_value);
    let rgb = image.to_rgb8();
    let (width, height) = rgb.dimensions();

    let mut out = Vec::new();
    let encoder = jpeg_encoder::Encoder::new(&mut out, quality);
    encoder
        .encode(rgb.as_raw(), width as u16, height as u16, jpeg_encoder::ColorType::Rgb)
        .map_err(|err| CompressorError::EncodeError(err.to_string()))?;

    Ok(out)
}
