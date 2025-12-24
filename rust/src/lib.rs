use wasm_bindgen::prelude::*;

mod errors;
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

    match format {
        InputFormat::Png => png::compress_png(
            data,
            quality,
            opts.dithering.unwrap_or(true),
            resize_mode,
            resize_value,
        )
        .map_err(map_err),
        InputFormat::Jpeg => jpeg::compress_jpeg(
            data,
            quality,
            opts.progressive.unwrap_or(true),
            resize_mode,
            resize_value,
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
