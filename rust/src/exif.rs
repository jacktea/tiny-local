use crate::errors::CompressorError;
use exif::{In, Reader, Tag};
use std::io::{BufReader, Cursor};

/// 从JPEG数据中获取EXIF方向信息
pub fn get_exif_orientation(data: &[u8]) -> Result<u32, CompressorError> {
    // 尝试从JPEG中读取EXIF数据
    let mut cursor = Cursor::new(data);
    let mut reader = BufReader::new(&mut cursor);
    let exif = Reader::new()
        .read_from_container(&mut reader)
        .map_err(|e| CompressorError::ExifError(e.to_string()))?;

    // 获取方向标签 (0x0112)
    let orientation = exif
        .get_field(Tag::Orientation, In::PRIMARY)
        .ok_or_else(|| CompressorError::ExifError("No orientation tag found".to_string()))?;

    // 方向值为 1-8
    Ok(orientation.value.get_uint(0).unwrap_or(1))
}

/// 根据EXIF方向旋转图片
pub fn apply_exif_rotation(image: image::DynamicImage, orientation: u32) -> image::DynamicImage {
    match orientation {
        1 => image,  // 正常，不旋转
        2 => image.fliph(),  // 水平翻转
        3 => image.rotate180(),  // 旋转180度
        4 => image.flipv(),  // 垂直翻转
        5 => image.flipv().rotate90(),  // 垂直翻转 + 旋转90度
        6 => image.rotate90(),  // 旋转90度
        7 => image.fliph().rotate90(),  // 水平翻转 + 旋转90度
        8 => image.rotate270(),  // 旋转270度
        _ => image,
    }
}

/// 检查是否包含EXIF数据
pub fn has_exif(data: &[u8]) -> bool {
    let mut cursor = Cursor::new(data);
    let mut reader = BufReader::new(&mut cursor);
    Reader::new().read_from_container(&mut reader).is_ok()
}
