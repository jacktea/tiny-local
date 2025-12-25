#[derive(Debug, Clone, Copy)]
pub enum InputFormat {
    Png,
    Jpeg,
    Webp,
    Avif,
}

impl InputFormat {
    pub fn from_str(value: &str) -> Option<Self> {
        match value.to_ascii_lowercase().as_str() {
            "png" => Some(InputFormat::Png),
            "jpeg" | "jpg" => Some(InputFormat::Jpeg),
            "webp" => Some(InputFormat::Webp),
            "avif" => Some(InputFormat::Avif),
            _ => None,
        }
    }
}

pub fn detect_format(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() >= 8
        && bytes[0] == 0x89
        && bytes[1] == 0x50
        && bytes[2] == 0x4e
        && bytes[3] == 0x47
        && bytes[4] == 0x0d
        && bytes[5] == 0x0a
        && bytes[6] == 0x1a
        && bytes[7] == 0x0a
    {
        return Some("png");
    }

    if bytes.len() >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff {
        return Some("jpeg");
    }

    if bytes.len() >= 12
        && &bytes[0..4] == b"RIFF"
        && &bytes[8..12] == b"WEBP"
    {
        return Some("webp");
    }

    // AVIF 文件类型检测 (ftypavif / ftypavis)
    if bytes.len() >= 28
        && &bytes[4..8] == b"ftyp"
        && (&bytes[8..12] == b"avif" || &bytes[8..12] == b"avis")
    {
        return Some("avif");
    }

    None
}
