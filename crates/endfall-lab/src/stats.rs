//! The few statistics a report needs: the Wilson interval of a win rate, and medians and quartiles.

/// The 95% Wilson score interval of `k` successes in `n` trials, as fractions: (low, high). (0, 1) when `n` is 0.
pub fn wilson(k: usize, n: usize) -> (f64, f64) {
    if n == 0 {
        return (0.0, 1.0);
    }
    let z = 1.959_963_984_540_054;
    let (n, p) = (n as f64, k as f64 / n as f64);
    let z2 = z * z;
    let centre = (p + z2 / (2.0 * n)) / (1.0 + z2 / n);
    let half = z * (p * (1.0 - p) / n + z2 / (4.0 * n * n)).sqrt() / (1.0 + z2 / n);
    ((centre - half).max(0.0), (centre + half).min(1.0))
}

/// The `q` quantile (0 to 1) of `xs` by linear interpolation between order statistics (the common "type 7"
/// definition: the median of an even count is the mean of the middle two). None for an empty list.
pub fn quantile(xs: &[f64], q: f64) -> Option<f64> {
    if xs.is_empty() {
        return None;
    }
    let mut v = xs.to_vec();
    v.sort_by(f64::total_cmp);
    let h = (v.len() - 1) as f64 * q;
    let (lo, hi) = (h.floor() as usize, h.ceil() as usize);
    Some(v[lo] + (v[hi] - v[lo]) * (h - lo as f64))
}

pub fn median(xs: &[f64]) -> Option<f64> {
    quantile(xs, 0.5)
}

/// m:ss, or whole seconds, as seconds; None for anything else (digits only: no sign, fraction or exponent).
pub fn parse_mmss(t: &str) -> Option<f64> {
    let num = |d: &str| {
        (!d.is_empty() && d.len() <= 6 && d.bytes().all(|b| b.is_ascii_digit()))
            .then(|| d.parse::<u32>().ok())
            .flatten()
    };
    match t.split_once(':') {
        Some((m, s)) if s.len() == 2 => {
            Some(num(m)? as f64 * 60.0 + num(s).filter(|&s| s < 60)? as f64)
        }
        Some(_) => None,
        None => num(t).map(f64::from),
    }
}

/// Seconds as m:ss.
pub fn mmss(secs: f64) -> String {
    if !secs.is_finite() {
        return "—".into();
    }
    let s = secs.round() as i64;
    format!("{}:{:02}", s / 60, s % 60)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_wilson_interval_matches_known_values() {
        // (known values: e.g. 15 of 30, 27 of 30, 0 of 10, from the closed form at z = 1.96)
        let close =
            |a: (f64, f64), b: (f64, f64)| (a.0 - b.0).abs() < 5e-4 && (a.1 - b.1).abs() < 5e-4;
        assert!(
            close(wilson(15, 30), (0.3315, 0.6685)),
            "{:?}",
            wilson(15, 30)
        );
        assert!(
            close(wilson(27, 30), (0.7438, 0.9654)),
            "{:?}",
            wilson(27, 30)
        );
        assert!(close(wilson(0, 10), (0.0, 0.2775)), "{:?}", wilson(0, 10));
        assert!(
            close(wilson(55, 100), (0.4524, 0.6439)),
            "{:?}",
            wilson(55, 100)
        );
        assert_eq!(wilson(0, 0), (0.0, 1.0));
    }

    #[test]
    fn medians_and_quartiles() {
        assert_eq!(median(&[3.0, 1.0, 2.0]), Some(2.0));
        assert_eq!(median(&[4.0, 1.0, 3.0, 2.0]), Some(2.5));
        assert_eq!(median(&[]), None);
        assert_eq!(quantile(&[1.0, 2.0, 3.0, 4.0, 5.0], 0.25), Some(2.0));
        assert_eq!(quantile(&[1.0, 2.0, 3.0, 4.0], 0.75), Some(3.25));
        assert_eq!(mmss(605.4), "10:05");
        assert_eq!(parse_mmss("12:00"), Some(720.0));
        assert_eq!(parse_mmss("7:05"), Some(425.0));
        assert_eq!(parse_mmss("300"), Some(300.0));
        for bad in [
            "7:5", "7:60", "x:00", "", "inf", "1:2:3", "+7:00", "7:+5", "420.5", "1e3", ":00",
            "-0:30",
        ] {
            assert_eq!(parse_mmss(bad), None, "{bad}");
        }
    }
}
