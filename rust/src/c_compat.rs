#[cfg(target_arch = "wasm32")]
use std::alloc::{alloc, dealloc, Layout};
#[cfg(target_arch = "wasm32")]
use std::os::raw::{c_int, c_void};
#[cfg(target_arch = "wasm32")]
use std::ptr;

#[cfg(target_arch = "wasm32")]
const HEADER_SIZE: usize = std::mem::size_of::<usize>();

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn malloc(size: usize) -> *mut u8 {
    if size == 0 {
        return ptr::null_mut();
    }

    let total = match size.checked_add(HEADER_SIZE) {
        Some(total) => total,
        None => return ptr::null_mut(),
    };
    let layout = match Layout::from_size_align(total, std::mem::align_of::<usize>()) {
        Ok(layout) => layout,
        Err(_) => return ptr::null_mut(),
    };

    let ptr = alloc(layout);
    if ptr.is_null() {
        return ptr::null_mut();
    }

    (ptr as *mut usize).write(size);
    ptr.add(HEADER_SIZE)
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn free(ptr: *mut u8) {
    if ptr.is_null() {
        return;
    }

    let header_ptr = ptr.sub(HEADER_SIZE) as *mut usize;
    let size = header_ptr.read();
    let total = match size.checked_add(HEADER_SIZE) {
        Some(total) => total,
        None => return,
    };
    let layout = match Layout::from_size_align(total, std::mem::align_of::<usize>()) {
        Ok(layout) => layout,
        Err(_) => return,
    };

    dealloc(header_ptr as *mut u8, layout);
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn calloc(nmemb: usize, size: usize) -> *mut u8 {
    let total = match nmemb.checked_mul(size) {
        Some(total) => total,
        None => return ptr::null_mut(),
    };

    let ptr = malloc(total);
    if ptr.is_null() {
        return ptr::null_mut();
    }

    ptr::write_bytes(ptr, 0, total);
    ptr
}

#[cfg(target_arch = "wasm32")]
type CmpFn = unsafe extern "C" fn(*const c_void, *const c_void) -> c_int;

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn bsearch(
    key: *const c_void,
    base: *const c_void,
    nmemb: usize,
    size: usize,
    compar: Option<CmpFn>,
) -> *mut c_void {
    let compar = match compar {
        Some(compar) => compar,
        None => return ptr::null_mut(),
    };
    if nmemb == 0 || size == 0 {
        return ptr::null_mut();
    }

    let mut left = 0usize;
    let mut right = nmemb;
    while left < right {
        let mid = left + (right - left) / 2;
        let elem = (base as *const u8).add(mid * size) as *const c_void;
        let cmp = compar(key, elem);
        if cmp < 0 {
            right = mid;
        } else if cmp > 0 {
            left = mid + 1;
        } else {
            return elem as *mut c_void;
        }
    }

    ptr::null_mut()
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn qsort(
    base: *mut c_void,
    nmemb: usize,
    size: usize,
    compar: Option<CmpFn>,
) {
    let compar = match compar {
        Some(compar) => compar,
        None => return,
    };
    if nmemb <= 1 || size == 0 {
        return;
    }

    let mut scratch = vec![0u8; size];
    qsort_inner(base as *mut u8, nmemb, size, compar, &mut scratch);
}

#[cfg(target_arch = "wasm32")]
unsafe fn qsort_inner(
    base: *mut u8,
    nmemb: usize,
    size: usize,
    compar: CmpFn,
    scratch: &mut [u8],
) {
    if nmemb <= 1 {
        return;
    }

    let pivot_index = nmemb / 2;
    let last_index = nmemb - 1;
    swap_elem(base, pivot_index, last_index, size, scratch);

    let pivot_ptr = base.add(last_index * size) as *const c_void;
    let mut store = 0usize;
    for idx in 0..last_index {
        let elem_ptr = base.add(idx * size) as *const c_void;
        if compar(elem_ptr, pivot_ptr) < 0 {
            swap_elem(base, idx, store, size, scratch);
            store += 1;
        }
    }
    swap_elem(base, store, last_index, size, scratch);

    qsort_inner(base, store, size, compar, scratch);
    qsort_inner(base.add((store + 1) * size), nmemb - store - 1, size, compar, scratch);
}

#[cfg(target_arch = "wasm32")]
unsafe fn swap_elem(
    base: *mut u8,
    a: usize,
    b: usize,
    size: usize,
    scratch: &mut [u8],
) {
    if a == b {
        return;
    }

    let a_ptr = base.add(a * size);
    let b_ptr = base.add(b * size);
    ptr::copy_nonoverlapping(a_ptr, scratch.as_mut_ptr(), size);
    ptr::copy_nonoverlapping(b_ptr, a_ptr, size);
    ptr::copy_nonoverlapping(scratch.as_ptr(), b_ptr, size);
}
