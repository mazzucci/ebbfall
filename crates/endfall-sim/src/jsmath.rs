//! Numeric helpers that reproduce JavaScript semantics exactly, so the port behaves like src/sim/ bit for bit
//! where it matters (the parity script compares per-tick state hashes against the JS sim running in Node).
//! WASM float arithmetic is deterministic across browsers and CPUs, and libm is the same code natively and in
//! WASM, so f64 game rules are safe for lockstep as long as everyone runs the same .wasm build.

pub const PI: f64 = std::f64::consts::PI;

/// `Math.round`: halves round toward +infinity.
pub fn round(x: f64) -> f64 {
    let f = x.floor();
    if x - f >= 0.5 { f + 1.0 } else { f }
}

/// `Math.sign` (0 stays 0, unlike `f64::signum`).
pub fn sign(x: f64) -> f64 {
    if x > 0.0 {
        1.0
    } else if x < 0.0 {
        -1.0
    } else {
        x
    }
}

/// `x | 0` (ToInt32): truncate, wrap modulo 2^32.
pub fn to_i32(x: f64) -> i32 {
    if !x.is_finite() {
        return 0;
    }
    (x.trunc() as i64) as i32
}

/// `Math.hypot(a, b)` as V8 computes it: scale by the larger magnitude, Kahan-compensated sum, sqrt.
pub fn hypot(a: f64, b: f64) -> f64 {
    let (a, b) = (a.abs(), b.abs());
    if a.is_infinite() || b.is_infinite() {
        return f64::INFINITY;
    }
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    let max = a.max(b);
    if max == 0.0 {
        return 0.0;
    }
    let (mut sum, mut comp) = (0.0f64, 0.0f64);
    for v in [a, b] {
        let n = v / max;
        let summand = n * n - comp;
        let prelim = sum + summand;
        comp = (prelim - sum) - summand;
        sum = prelim;
    }
    sum.sqrt() * max
}

pub fn atan2(y: f64, x: f64) -> f64 {
    libm::atan2(y, x)
}
pub fn cos(x: f64) -> f64 {
    libm::cos(x)
}
pub fn sin(x: f64) -> f64 {
    libm::sin(x)
}

pub fn clamp(v: f64, a: f64, b: f64) -> f64 {
    if v < a {
        a
    } else if v > b {
        b
    } else {
        v
    }
}

pub fn dist(ax: f64, ay: f64, bx: f64, by: f64) -> f64 {
    hypot(ax - bx, ay - by)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_matches_js() {
        assert_eq!(round(2.5), 3.0);
        assert_eq!(round(-2.5), -2.0);
        assert_eq!(round(-0.4), -0.0);
        assert_eq!(round(1.49), 1.0);
    }

    #[test]
    fn to_i32_wraps_and_truncates() {
        assert_eq!(to_i32(-3.7), -3);
        assert_eq!(to_i32(4_294_967_296.0 + 5.0), 5);
        assert_eq!(to_i32(f64::NAN), 0);
    }

    #[test]
    fn hypot_basics() {
        assert_eq!(hypot(3.0, 4.0), 5.0);
        assert_eq!(hypot(0.0, -2.0), 2.0);
        assert_eq!(hypot(0.0, 0.0), 0.0);
    }
}
