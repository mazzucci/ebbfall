//! Logistic regression for the `plans` batch: which settings of a plan move the odds of winning. Fitted by iteratively
//! reweighted least squares (Newton's method on the log-likelihood), deterministic: the same rows give the same bits.

/// A fitted model: a coefficient per column of the design (the first is the intercept when the caller adds one), its
/// standard error (from the inverse of the information matrix), and the fit's log-likelihood.
#[derive(Clone, Debug)]
pub struct Fit {
    pub beta: Vec<f64>,
    pub se: Vec<f64>,
    pub loglik: f64,
    /// Newton steps taken; `converged` is false when it hit the limit.
    pub steps: usize,
    pub converged: bool,
}

impl Fit {
    /// The 95% interval of coefficient `j`.
    pub fn interval(&self, j: usize) -> (f64, f64) {
        let z = 1.959_963_984_540_054;
        (self.beta[j] - z * self.se[j], self.beta[j] + z * self.se[j])
    }
}

fn sigmoid(t: f64) -> f64 {
    if t >= 0.0 {
        1.0 / (1.0 + (-t).exp())
    } else {
        let e = t.exp();
        e / (1.0 + e)
    }
}

/// The probability the model gives a row.
pub fn predict(beta: &[f64], row: &[f64]) -> f64 {
    sigmoid(row.iter().zip(beta).map(|(x, b)| x * b).sum())
}

fn loglik(x: &[Vec<f64>], y: &[bool], beta: &[f64]) -> f64 {
    x.iter()
        .zip(y)
        .map(|(row, &won)| {
            let p = predict(beta, row).clamp(1e-15, 1.0 - 1e-15);
            if won { p.ln() } else { (1.0 - p).ln() }
        })
        .sum()
}

/// Solve `a x = b` for a symmetric positive definite `a` (Gaussian elimination with partial pivoting); also returns
/// the inverse of `a`. None when `a` is singular.
fn solve_and_invert(a: &[Vec<f64>], b: &[f64]) -> Option<(Vec<f64>, Vec<Vec<f64>>)> {
    let n = b.len();
    // [a | b | I]
    let mut m: Vec<Vec<f64>> = (0..n)
        .map(|i| {
            let mut r = a[i].clone();
            r.push(b[i]);
            r.extend((0..n).map(|j| if i == j { 1.0 } else { 0.0 }));
            r
        })
        .collect();
    for col in 0..n {
        let piv = (col..n)
            .max_by(|&p, &q| m[p][col].abs().total_cmp(&m[q][col].abs()).then(q.cmp(&p)))?;
        if m[piv][col].abs() < 1e-12 {
            return None;
        }
        m.swap(col, piv);
        let d = m[col][col];
        for v in m[col].iter_mut() {
            *v /= d;
        }
        for r in 0..n {
            if r != col {
                let f = m[r][col];
                if f != 0.0 {
                    for c in 0..m[r].len() {
                        m[r][c] -= f * m[col][c];
                    }
                }
            }
        }
    }
    let x = (0..n).map(|i| m[i][n]).collect();
    let inv = (0..n).map(|i| m[i][n + 1..].to_vec()).collect();
    Some((x, inv))
}

/// Fit `y` (won or not) on the design `x` (one row per game, the same length each; add a column of ones for an
/// intercept). None when the information matrix is singular (a column constant or a copy of another).
pub fn fit(x: &[Vec<f64>], y: &[bool]) -> Option<Fit> {
    let p = x.first().map_or(0, Vec::len);
    // (no columns, or no more rows than columns: nothing to fit)
    if p == 0 || x.len() <= p {
        return None;
    }
    let mut beta = vec![0.0; p];
    let mut ll = loglik(x, y, &beta);
    let (mut steps, mut converged) = (0, false);
    let mut info_inv = vec![vec![0.0; p]; p];
    while steps < 50 {
        steps += 1;
        // gradient X'(y - p) and information X'WX
        let mut grad = vec![0.0; p];
        let mut info = vec![vec![0.0; p]; p];
        for (row, &won) in x.iter().zip(y) {
            let pr = predict(&beta, row);
            let (r, w) = ((won as u8 as f64) - pr, pr * (1.0 - pr));
            for i in 0..p {
                grad[i] += row[i] * r;
                for j in 0..p {
                    info[i][j] += row[i] * w * row[j];
                }
            }
        }
        let (step, inv) = solve_and_invert(&info, &grad)?;
        info_inv = inv;
        // (step-halving keeps every step uphill: a far-off start cannot overshoot)
        let mut scale = 1.0;
        let mut next;
        loop {
            next = beta
                .iter()
                .zip(&step)
                .map(|(b, s)| b + scale * s)
                .collect::<Vec<_>>();
            let l = loglik(x, y, &next);
            if l >= ll - 1e-12 || scale < 1e-6 {
                break;
            }
            scale /= 2.0;
        }
        let l = loglik(x, y, &next);
        let moved = step.iter().map(|s| (s * scale).abs()).fold(0.0, f64::max);
        beta = next;
        let gain = l - ll;
        ll = l;
        if moved < 1e-10 || gain.abs() < 1e-12 {
            converged = true;
            break;
        }
    }
    // the information at the final estimate, for the standard errors
    let mut info = vec![vec![0.0; p]; p];
    for row in x {
        let pr = predict(&beta, row);
        let w = pr * (1.0 - pr);
        for i in 0..p {
            for j in 0..p {
                info[i][j] += row[i] * w * row[j];
            }
        }
    }
    if let Some((_, inv)) = solve_and_invert(&info, &vec![0.0; p]) {
        info_inv = inv;
    }
    let se = (0..p).map(|j| info_inv[j][j].max(0.0).sqrt()).collect();
    Some(Fit {
        beta,
        se,
        loglik: ll,
        steps,
        converged,
    })
}

/// Pearson correlation of two columns (0 when either is constant).
pub fn correlation(a: &[f64], b: &[f64]) -> f64 {
    let n = a.len() as f64;
    if n == 0.0 {
        return 0.0;
    }
    let (ma, mb) = (a.iter().sum::<f64>() / n, b.iter().sum::<f64>() / n);
    let (mut sab, mut saa, mut sbb) = (0.0, 0.0, 0.0);
    for (x, y) in a.iter().zip(b) {
        sab += (x - ma) * (y - mb);
        saa += (x - ma) * (x - ma);
        sbb += (y - mb) * (y - mb);
    }
    if saa == 0.0 || sbb == 0.0 {
        0.0
    } else {
        sab / (saa * sbb).sqrt()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use endfall_sim::Mulberry32;

    /// Rows drawn from known coefficients: the fit recovers them within their intervals' width.
    #[test]
    fn it_recovers_known_coefficients_and_is_deterministic() {
        let truth = [0.3, 1.2, -0.8, 0.0];
        let mut r = Mulberry32::new(7);
        let mut u = || r.next_u32() as f64 / 4_294_967_296.0;
        let (mut x, mut y) = (Vec::new(), Vec::new());
        for _ in 0..4000 {
            // (a roughly normal feature: the sum of four uniforms, centred and scaled)
            let mut n = || ((0..4).map(|_| u()).sum::<f64>() - 2.0) * 1.7;
            let row = vec![1.0, n(), n(), n()];
            let p = predict(&truth, &row);
            y.push(u() < p);
            x.push(row);
        }
        let f = fit(&x, &y).expect("a fit");
        assert!(f.converged, "converged in {} steps", f.steps);
        for (j, &t) in truth.iter().enumerate() {
            let (lo, hi) = f.interval(j);
            assert!(
                (f.beta[j] - t).abs() < 0.15 && lo < t + 0.1 && t - 0.1 < hi,
                "coefficient {j}: {:.3} ({lo:.3} to {hi:.3}), truth {t}",
                f.beta[j]
            );
        }
        // the null feature: within three standard errors of zero (a 95% interval misses zero one time in twenty)
        assert!(
            f.beta[3].abs() < 3.0 * f.se[3],
            "the null feature: {:.3} (se {:.3})",
            f.beta[3],
            f.se[3]
        );
        let again = fit(&x, &y).unwrap();
        assert_eq!(
            f.beta.iter().map(|b| b.to_bits()).collect::<Vec<_>>(),
            again.beta.iter().map(|b| b.to_bits()).collect::<Vec<_>>(),
            "the same rows, the same bits"
        );
    }

    #[test]
    fn a_constant_column_beside_the_intercept_is_singular() {
        let x = vec![vec![1.0, 2.0]; 10];
        let y = vec![
            true, false, true, false, true, false, true, false, true, false,
        ];
        assert!(fit(&x, &y).is_none());
    }
}
