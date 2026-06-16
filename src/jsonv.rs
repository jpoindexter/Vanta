// Minimal, correct JSON parse/serialize — zero deps, for reading the loop
// ledger files the TS layer writes under .vanta/loops/. A field-scraping
// approach would break the moment a goal or prompt string contains a brace or
// a key-looking substring, so this is a real recursive-descent parser: strings
// with full escape handling (incl. surrogate pairs), numbers, bools, null,
// arrays, objects. Objects keep insertion order (Vec, not a map) so files
// round-trip stably.

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Value>),
    Obj(Vec<(String, Value)>),
}

impl Value {
    pub fn get(&self, key: &str) -> Option<&Value> {
        match self {
            Value::Obj(pairs) => pairs.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    pub fn get_mut(&mut self, key: &str) -> Option<&mut Value> {
        match self {
            Value::Obj(pairs) => pairs.iter_mut().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    /// Replace or append a key on an object. No-op on non-objects.
    pub fn set(&mut self, key: &str, value: Value) {
        if let Value::Obj(pairs) = self {
            match pairs.iter_mut().find(|(k, _)| k == key) {
                Some(pair) => pair.1 = value,
                None => pairs.push((key.to_string(), value)),
            }
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::Str(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Value::Num(n) => Some(*n),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Value::Bool(b) => Some(*b),
            _ => None,
        }
    }

    pub fn as_arr(&self) -> Option<&Vec<Value>> {
        match self {
            Value::Arr(items) => Some(items),
            _ => None,
        }
    }
}

pub fn parse(text: &str) -> Result<Value, String> {
    let bytes = text.as_bytes();
    let mut p = Parser { bytes, pos: 0 };
    p.skip_ws();
    let v = p.value(0)?;
    p.skip_ws();
    if p.pos != bytes.len() {
        return Err(format!("trailing data at byte {}", p.pos));
    }
    Ok(v)
}

const MAX_DEPTH: usize = 64;

struct Parser<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> Parser<'a> {
    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.pos).copied()
    }

    fn skip_ws(&mut self) {
        while matches!(self.peek(), Some(b' ' | b'\t' | b'\n' | b'\r')) {
            self.pos += 1;
        }
    }

    fn eat(&mut self, b: u8) -> Result<(), String> {
        if self.peek() == Some(b) {
            self.pos += 1;
            Ok(())
        } else {
            Err(format!("expected '{}' at byte {}", b as char, self.pos))
        }
    }

    fn lit(&mut self, word: &str, v: Value) -> Result<Value, String> {
        if self.bytes[self.pos..].starts_with(word.as_bytes()) {
            self.pos += word.len();
            Ok(v)
        } else {
            Err(format!("invalid literal at byte {}", self.pos))
        }
    }

    fn value(&mut self, depth: usize) -> Result<Value, String> {
        if depth > MAX_DEPTH {
            return Err("nesting too deep".to_string());
        }
        match self.peek() {
            Some(b'{') => self.object(depth),
            Some(b'[') => self.array(depth),
            Some(b'"') => Ok(Value::Str(self.string()?)),
            Some(b't') => self.lit("true", Value::Bool(true)),
            Some(b'f') => self.lit("false", Value::Bool(false)),
            Some(b'n') => self.lit("null", Value::Null),
            Some(_) => self.number(),
            None => Err("unexpected end of input".to_string()),
        }
    }

    fn object(&mut self, depth: usize) -> Result<Value, String> {
        self.eat(b'{')?;
        let mut pairs = Vec::new();
        self.skip_ws();
        if self.peek() == Some(b'}') {
            self.pos += 1;
            return Ok(Value::Obj(pairs));
        }
        loop {
            self.skip_ws();
            let key = self.string()?;
            self.skip_ws();
            self.eat(b':')?;
            self.skip_ws();
            let val = self.value(depth + 1)?;
            pairs.push((key, val));
            self.skip_ws();
            match self.peek() {
                Some(b',') => self.pos += 1,
                Some(b'}') => {
                    self.pos += 1;
                    return Ok(Value::Obj(pairs));
                }
                _ => return Err(format!("expected ',' or '}}' at byte {}", self.pos)),
            }
        }
    }

    fn array(&mut self, depth: usize) -> Result<Value, String> {
        self.eat(b'[')?;
        let mut items = Vec::new();
        self.skip_ws();
        if self.peek() == Some(b']') {
            self.pos += 1;
            return Ok(Value::Arr(items));
        }
        loop {
            self.skip_ws();
            items.push(self.value(depth + 1)?);
            self.skip_ws();
            match self.peek() {
                Some(b',') => self.pos += 1,
                Some(b']') => {
                    self.pos += 1;
                    return Ok(Value::Arr(items));
                }
                _ => return Err(format!("expected ',' or ']' at byte {}", self.pos)),
            }
        }
    }

    fn string(&mut self) -> Result<String, String> {
        self.eat(b'"')?;
        let mut out = String::new();
        loop {
            match self.peek() {
                Some(b'"') => {
                    self.pos += 1;
                    return Ok(out);
                }
                Some(b'\\') => {
                    self.pos += 1;
                    self.escape(&mut out)?;
                }
                Some(_) => {
                    // Consume one full UTF-8 scalar, not one byte.
                    let rest = &self.bytes[self.pos..];
                    let s = std::str::from_utf8(rest).map_err(|e| e.to_string())?;
                    let ch = s.chars().next().ok_or("unexpected end in string")?;
                    out.push(ch);
                    self.pos += ch.len_utf8();
                }
                None => return Err("unterminated string".to_string()),
            }
        }
    }

    fn escape(&mut self, out: &mut String) -> Result<(), String> {
        let esc = self.peek().ok_or("unterminated escape")?;
        self.pos += 1;
        match esc {
            b'"' => out.push('"'),
            b'\\' => out.push('\\'),
            b'/' => out.push('/'),
            b'b' => out.push('\u{0008}'),
            b'f' => out.push('\u{000C}'),
            b'n' => out.push('\n'),
            b'r' => out.push('\r'),
            b't' => out.push('\t'),
            b'u' => {
                let hi = self.hex4()?;
                let ch = if (0xD800..0xDC00).contains(&hi) {
                    // Surrogate pair: expect \uXXXX low half next.
                    if self.peek() == Some(b'\\') {
                        self.pos += 1;
                        self.eat(b'u')?;
                        let lo = self.hex4()?;
                        let c = 0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00);
                        char::from_u32(c).unwrap_or('\u{FFFD}')
                    } else {
                        '\u{FFFD}'
                    }
                } else {
                    char::from_u32(hi).unwrap_or('\u{FFFD}')
                };
                out.push(ch);
            }
            _ => return Err(format!("bad escape '\\{}'", esc as char)),
        }
        Ok(())
    }

    fn hex4(&mut self) -> Result<u32, String> {
        if self.pos + 4 > self.bytes.len() {
            return Err("short \\u escape".to_string());
        }
        let hex = std::str::from_utf8(&self.bytes[self.pos..self.pos + 4]).map_err(|e| e.to_string())?;
        self.pos += 4;
        u32::from_str_radix(hex, 16).map_err(|e| e.to_string())
    }

    fn number(&mut self) -> Result<Value, String> {
        let start = self.pos;
        while matches!(
            self.peek(),
            Some(b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9')
        ) {
            self.pos += 1;
        }
        let text = std::str::from_utf8(&self.bytes[start..self.pos]).map_err(|e| e.to_string())?;
        text.parse::<f64>()
            .map(Value::Num)
            .map_err(|_| format!("bad number at byte {start}"))
    }
}

#[path = "jsonv_emit.rs"]
mod emit;
pub use emit::serialize;

#[cfg(test)]
#[path = "jsonv_tests.rs"]
mod tests;
