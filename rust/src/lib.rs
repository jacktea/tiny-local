use wasm_bindgen::prelude::*;

mod avif;
mod errors;
mod exif;
mod jpeg;
mod png;
mod utils;

#[cfg(feature = "webp")]
mod webp;

use errors::CompressorError;
use utils::InputFormat;

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

#[derive(Default, serde::Deserialize)]
struct CompressOptions {
    dithering: Option<bool>,
    progressive: Option<bool>,
    // 尺寸调整选项
    resize_mode: Option<String>, // "none", "percentage", "maxWidth", "maxHeight", "fixed"
    resize_value: Option<u32>,   // 百分比值或像素值
    // EXIF处理选项
    auto_rotate: Option<bool>,    // 自动旋转（根据EXIF方向）
    strip_exif: Option<bool>,     // 清除EXIF元数据
    // PNG 选项
    png_truecolor: Option<bool>, // 保留真彩（不做调色板量化）
}

#[wasm_bindgen]
pub fn compress_image(
    data: &[u8],
    format: &str,
    quality: u8,
    options: JsValue,
) -> Result<Vec<u8>, JsValue> {
    let opts = parse_options(options)?;
    let quality = quality.min(100);

    let format = InputFormat::from_str(format).ok_or_else(|| {
        JsValue::from_str(&CompressorError::UnsupportedFormat(format.to_string()).to_string())
    })?;

    let resize_mode = opts.resize_mode.as_deref().unwrap_or("none");
    let resize_value = opts.resize_value.unwrap_or(100);
    let auto_rotate = opts.auto_rotate.unwrap_or(true);
    let strip_exif = opts.strip_exif.unwrap_or(true);
    let png_truecolor = opts.png_truecolor.unwrap_or(false);

    match format {
        InputFormat::Png => png::compress_png(
            data,
            quality,
            opts.dithering.unwrap_or(true),
            resize_mode,
            resize_value,
            auto_rotate,
            png_truecolor,
        )
        .map_err(map_err),
        InputFormat::Jpeg => jpeg::compress_jpeg(
            data,
            quality,
            opts.progressive.unwrap_or(true),
            resize_mode,
            resize_value,
            auto_rotate,
            strip_exif,
        )
        .map_err(map_err),
        InputFormat::Webp => {
            #[cfg(feature = "webp")]
            {
                webp::compress_webp(data, quality).map_err(map_err)
            }
            #[cfg(not(feature = "webp"))]
            {
                Err(map_err(CompressorError::WebpNotEnabled))
            }
        }
        InputFormat::Avif => {
            // AVIF 编码通过浏览器 Canvas API 实现
            // 这里返回一个占位符，实际编码在 worker 的 fallback 中处理
            avif::compress_avif(data, quality).map_err(map_err)
        }
    }
}

#[wasm_bindgen]
pub fn detect_format(data: &[u8]) -> String {
    utils::detect_format(data).unwrap_or("unknown").to_string()
}

#[wasm_bindgen]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn parse_options(options: JsValue) -> Result<CompressOptions, JsValue> {
    if options.is_null() || options.is_undefined() {
        return Ok(CompressOptions::default());
    }

    serde_wasm_bindgen::from_value(options)
        .map_err(|err| JsValue::from_str(&format!("Invalid options: {err}")))
}

fn map_err(err: CompressorError) -> JsValue {
    JsValue::from_str(&err.to_string())
}
