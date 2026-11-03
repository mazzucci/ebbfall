//! A small JSON value: written with a fixed layout (the same value, the same bytes) and read back for `compare`.
//! Objects keep their keys in the order they were built, so the output never depends on a hash map's order.

use std::fmt::Write;

#[derive(Clone, Debug, PartialEq)]
pub enum Json {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Json>),
    Obj(Vec<(String, Json)>),
}

impl Json {
    pub fn obj() -> Json {
        Json::Obj(Vec::new())
    }
    /// Add a field (an object only).
    pub fn with(mut self, key: &str, v: impl Into<Json>) -> Json {
        if let Json::Obj(f) = &mut self {
            f.push((key.to_string(), v.into()));
        }
        self
    }
    pub fn get(&self, key: &str) -> Option<&Json> {
        match self {
            Json::Obj(f) => f.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }
    pub fn num(&self) -> Option<f64> {
        match self {
            Json::Num(n) => Some(*n),
            _ => None,
        }
    }
    pub fn str(&self) -> Option<&str> {
        match self {
            Json::Str(s) => Some(s),
            _ => None,
        }
    }
    pub fn arr(&self) -> &[Json] {
        match self {
            Json::Arr(a) => a,
            _ => &[],
        }
    }
    /// A field's number (NaN when it is missing or null).
    pub fn f(&self, key: &str) -> f64 {
        self.get(key).and_then(Json::num).unwrap_or(f64::NAN)
    }

    /// The text: objects and arrays of objects one entry a line, everything else on one line.
    pub fn write(&self) -> String {
        let mut out = String::new();
        self.write_to(&mut out, 0);
        out.push('\n');
        out
    }
    fn write_to(&self, out: &mut String, depth: usize) {
        match self {
            Json::Null => out.push_str("null"),
            Json::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
            Json::Num(n) => write_num(out, *n),
            Json::Str(s) => write_str(out, s),
            Json::Arr(a) => {
                let nested =
                    a.iter().any(|v| matches!(v, Json::Obj(_) | Json::Arr(_))) && depth < 3;
                out.push('[');
                for (i, v) in a.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    if nested {
                        newline(out, depth + 1);
                    }
                    v.write_to(out, depth + 1);
                }
                if nested && !a.is_empty() {
                    newline(out, depth);
                }
                out.push(']');
            }
            Json::Obj(f) => {
                let nested = depth < 2;
                out.push('{');
                for (i, (k, v)) in f.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    if nested {
                        newline(out, depth + 1);
                    }
                    write_str(out, k);
                    out.push(':');
                    v.write_to(out, depth + 1);
                }
                if nested && !f.is_empty() {
                    newline(out, depth);
                }
                out.push('}');
            }
        }
    }

    pub fn parse(text: &str) -> Result<Json, String> {
        let mut p = Parser {
            s: text.as_bytes(),
            i: 0,
        };
        let v = p.value()?;
        p.ws();
        if p.i != p.s.len() {
            return Err(format!("trailing text at byte {}", p.i));
        }
        Ok(v)
    }
}

fn newline(out: &mut String, depth: usize) {
    out.push('\n');
    for _ in 0..depth {
        out.push(' ');
    }
}

/// Integers without a fraction; anything else in Rust's shortest form that reads back exactly; NaN and infinities
/// (which JSON has not) as null.
fn write_num(out: &mut String, n: f64) {
    if !n.is_finite() {
        out.push_str("null");
    } else if n.fract() == 0.0 && n.abs() < 1e15 {
        let _ = write!(out, "{}", n as i64);
    } else {
        let _ = write!(out, "{n}");
    }
}

fn write_str(out: &mut String, s: &str) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

impl From<f64> for Json {
    fn from(n: f64) -> Json {
        Json::Num(n)
    }
}
impl From<u32> for Json {
    fn from(n: u32) -> Json {
        Json::Num(n as f64)
    }
}
impl From<i32> for Json {
    fn from(n: i32) -> Json {
        Json::Num(n as f64)
    }
}
impl From<i64> for Json {
    fn from(n: i64) -> Json {
        Json::Num(n as f64)
    }
}
impl From<usize> for Json {
    fn from(n: usize) -> Json {
        Json::Num(n as f64)
    }
}
impl From<bool> for Json {
    fn from(b: bool) -> Json {
        Json::Bool(b)
    }
}
impl From<&str> for Json {
    fn from(s: &str) -> Json {
        Json::Str(s.to_string())
    }
}
impl From<String> for Json {
    fn from(s: String) -> Json {
        Json::Str(s)
    }
}
impl<T: Into<Json>> From<Option<T>> for Json {
    fn from(v: Option<T>) -> Json {
        v.map_or(Json::Null, Into::into)
    }
}
impl<T: Into<Json>> From<Vec<T>> for Json {
    fn from(v: Vec<T>) -> Json {
        Json::Arr(v.into_iter().map(Into::into).collect())
    }
}

struct Parser<'a> {
    s: &'a [u8],
    i: usize,
}

impl Parser<'_> {
    fn ws(&mut self) {
        while self.i < self.s.len() && self.s[self.i].is_ascii_whitespace() {
            self.i += 1;
        }
    }
    fn eat(&mut self, c: u8) -> Result<(), String> {
        self.ws();
        if self.s.get(self.i) == Some(&c) {
            self.i += 1;
            Ok(())
        } else {
            Err(format!("expected '{}' at byte {}", c as char, self.i))
        }
    }
    fn word(&mut self, w: &str, v: Json) -> Result<Json, String> {
        if self.s[self.i..].starts_with(w.as_bytes()) {
            self.i += w.len();
            Ok(v)
        } else {
            Err(format!("unexpected text at byte {}", self.i))
        }
    }
    fn value(&mut self) -> Result<Json, String> {
        self.ws();
        match self.s.get(self.i) {
            None => Err("unexpected end".into()),
            Some(b'n') => self.word("null", Json::Null),
            Some(b't') => self.word("true", Json::Bool(true)),
            Some(b'f') => self.word("false", Json::Bool(false)),
            Some(b'"') => self.string().map(Json::Str),
            Some(b'[') => {
                self.i += 1;
                let mut a = Vec::new();
                self.ws();
                if self.s.get(self.i) == Some(&b']') {
                    self.i += 1;
                    return Ok(Json::Arr(a));
                }
                loop {
                    a.push(self.value()?);
                    self.ws();
                    match self.s.get(self.i) {
                        Some(b',') => self.i += 1,
                        Some(b']') => {
                            self.i += 1;
                            return Ok(Json::Arr(a));
                        }
                        _ => return Err(format!("expected ',' or ']' at byte {}", self.i)),
                    }
                }
            }
            Some(b'{') => {
                self.i += 1;
                let mut f = Vec::new();
                self.ws();
                if self.s.get(self.i) == Some(&b'}') {
                    self.i += 1;
                    return Ok(Json::Obj(f));
                }
                loop {
                    self.ws();
                    let k = self.string()?;
                    self.eat(b':')?;
                    f.push((k, self.value()?));
                    self.ws();
                    match self.s.get(self.i) {
                        Some(b',') => self.i += 1,
                        Some(b'}') => {
                            self.i += 1;
                            return Ok(Json::Obj(f));
                        }
                        _ => return Err(format!("expected ',' or '}}' at byte {}", self.i)),
                    }
                }
            }
            Some(_) => {
                let start = self.i;
                while self.i < self.s.len()
                    && matches!(
                        self.s[self.i],
                        b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9'
                    )
                {
                    self.i += 1;
                }
                let t = std::str::from_utf8(&self.s[start..self.i]).map_err(|e| e.to_string())?;
                t.parse::<f64>()
                    .map(Json::Num)
                    .map_err(|_| format!("bad number '{t}' at byte {start}"))
            }
        }
    }
    fn string(&mut self) -> Result<String, String> {
        if self.s.get(self.i) != Some(&b'"') {
            return Err(format!("expected a string at byte {}", self.i));
        }
        self.i += 1;
        let mut out = Vec::new();
        while let Some(&c) = self.s.get(self.i) {
            self.i += 1;
            match c {
                b'"' => return String::from_utf8(out).map_err(|e| e.to_string()),
                b'\\' => {
                    let e = *self.s.get(self.i).ok_or("unexpected end")?;
                    self.i += 1;
                    match e {
                        b'n' => out.push(b'\n'),
                        b't' => out.push(b'\t'),
                        b'u' => {
                            let hex = std::str::from_utf8(
                                self.s.get(self.i..self.i + 4).ok_or("bad escape")?,
                            )
                            .map_err(|e| e.to_string())?;
                            let c = u32::from_str_radix(hex, 16).map_err(|e| e.to_string())?;
                            self.i += 4;
                            let mut buf = [0u8; 4];
                            out.extend_from_slice(
                                char::from_u32(c)
                                    .unwrap_or('?')
                                    .encode_utf8(&mut buf)
                                    .as_bytes(),
                            );
                        }
                        c => out.push(c),
                    }
                }
                c => out.push(c),
            }
        }
        Err("unterminated string".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_value_reads_back_as_written() {
        let v = Json::obj()
            .with("a", 1.0)
            .with("b", 0.1 + 0.2)
            .with("s", "x \"q\" \\ \n")
            .with("n", Json::Null)
            .with("arr", vec![Json::obj().with("k", true), Json::Arr(vec![])])
            .with("nan", f64::NAN);
        let text = v.write();
        let back = Json::parse(&text).unwrap();
        assert_eq!(back.get("b").and_then(Json::num), Some(0.1 + 0.2));
        assert_eq!(back.get("s").and_then(Json::str), Some("x \"q\" \\ \n"));
        assert_eq!(back.get("nan"), Some(&Json::Null));
        assert_eq!(
            Json::parse(&back.write()).unwrap().write(),
            back.write(),
            "a fixed point"
        );
    }
}
