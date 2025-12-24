use crate::errors::CompressorError;

pub fn compress_webp(data: &[u8], quality: u8) -> Result<Vec<u8>, CompressorError> {
    let image = image::load_from_memory(data)?;
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();

    let encoder = webp::Encoder::from_rgba(rgba.as_raw(), width as u32, height as u32);
    let webp = encoder.encode(quality as f32);
    Ok(webp.to_vec())
}
