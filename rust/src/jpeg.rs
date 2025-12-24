use crate::errors::CompressorError;

#[cfg(not(target_arch = "wasm32"))]
pub fn compress_jpeg(
    data: &[u8],
    quality: u8,
    progressive: bool,
) -> Result<Vec<u8>, CompressorError> {
    let image = image::load_from_memory(data)?;
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
) -> Result<Vec<u8>, CompressorError> {
    let image = image::load_from_memory(data)?;
    let rgb = image.to_rgb8();
    let (width, height) = rgb.dimensions();

    let mut out = Vec::new();
    let encoder = jpeg_encoder::Encoder::new(&mut out, quality);
    encoder
        .encode(rgb.as_raw(), width as u16, height as u16, jpeg_encoder::ColorType::Rgb)
        .map_err(|err| CompressorError::EncodeError(err.to_string()))?;

    Ok(out)
}
