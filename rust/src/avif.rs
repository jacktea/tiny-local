use crate::errors::CompressorError;

/// AVIF 编码
/// 当启用 avif feature 时使用 ravif 编码，否则返回错误使用浏览器 fallback

#[cfg(feature = "avif")]
pub fn compress_avif(
    data: &[u8],
    quality: u8,
) -> Result<Vec<u8>, CompressorError> {
    use ravif::{Img, Encoder};
    use rgb::RGBA;

    // 解码原始图片
    let img = image::load_from_memory(data)
        .map_err(|e| CompressorError::EncodeError(format!("Failed to decode image: {}", e)))?;

    // 转换质量参数 (0-100 -> 1-100)
    let quality = quality.max(1).min(100) as f32;

    // 统一转换为 RGBA 格式进行编码
    let rgba_img = img.to_rgba8();
    let (width, height) = rgba_img.dimensions();
    let pixels: Vec<RGBA<u8>> = rgba_img
        .pixels()
        .map(|p| RGBA {
            r: p[0],
            g: p[1],
            b: p[2],
            a: p[3],
        })
        .collect();

    let img_ref = Img::new(pixels.as_slice(), width as usize, height as usize);

    let encoder = Encoder::new()
        .with_quality(quality)
        .with_alpha_quality(quality);

    let result = encoder.encode_rgba(img_ref)
        .map_err(|e| CompressorError::EncodeError(format!("AVIF encoding failed: {}", e)))?;

    Ok(result.avif_file)
}

#[cfg(not(feature = "avif"))]
pub fn compress_avif(
    _data: &[u8],
    _quality: u8,
) -> Result<Vec<u8>, CompressorError> {
    // AVIF feature 未启用，返回错误让主逻辑使用浏览器 Canvas API fallback
    Err(CompressorError::EncodeError(
        "AVIF encoding requires avif feature".to_string()
    ))
}
