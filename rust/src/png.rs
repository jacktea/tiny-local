use crate::errors::CompressorError;

pub fn compress_png(data: &[u8], quality: u8, dithering: bool) -> Result<Vec<u8>, CompressorError> {
    let image = image::load_from_memory(data)?;
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
