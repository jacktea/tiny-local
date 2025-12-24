use thiserror::Error;

#[derive(Debug, Error)]
pub enum CompressorError {
    #[error("Unsupported format: {0}")]
    UnsupportedFormat(String),
    #[error("Decode error: {0}")]
    DecodeError(String),
    #[error("Encode error: {0}")]
    EncodeError(String),
    #[error("WebP feature not enabled")]
    WebpNotEnabled,
    #[error("EXIF error: {0}")]
    ExifError(String),
}

impl From<image::ImageError> for CompressorError {
    fn from(err: image::ImageError) -> Self {
        CompressorError::DecodeError(err.to_string())
    }
}

impl From<png::EncodingError> for CompressorError {
    fn from(err: png::EncodingError) -> Self {
        CompressorError::EncodeError(err.to_string())
    }
}

#[cfg(feature = "webp")]
impl From<webp::WebPEncodingError> for CompressorError {
    fn from(err: webp::WebPEncodingError) -> Self {
        CompressorError::EncodeError(err.to_string())
    }
}
