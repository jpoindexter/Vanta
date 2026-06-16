// Tests for jsonv.rs — split to a companion file (loaded via #[cfg(test)] #[path]).
    use super::*;

    #[test]
    fn parses_and_roundtrips_a_loop_def_shape() {
        let text = r#"{
  "id": "ship-readme",
  "goal": "text with \"quotes\", braces {} and a fake \"status\": \"killed\" inside",
  "trigger": { "kind": "heartbeat", "everyTicks": 3 },
  "stages": [ { "name": "evaluate", "prompt": "End with SCORE: <0..1>" } ],
  "score": 0.85,
  "active": true,
  "lastRunAt": null
}"#;
        let v = parse(text).unwrap();
        assert_eq!(v.get("id").unwrap().as_str(), Some("ship-readme"));
        assert!(v.get("goal").unwrap().as_str().unwrap().contains("\"status\": \"killed\""));
        assert_eq!(v.get("trigger").unwrap().get("everyTicks").unwrap().as_f64(), Some(3.0));
        assert_eq!(v.get("score").unwrap().as_f64(), Some(0.85));
        assert_eq!(v.get("lastRunAt"), Some(&Value::Null));
        // Round-trip: serialize → reparse → identical tree.
        let again = parse(&serialize(&v)).unwrap();
        assert_eq!(v, again);
    }

    #[test]
    fn handles_escapes_unicode_and_surrogate_pairs() {
        let v = parse(r#"{"s":"line\nbreak \t tab é 😀"}"#).unwrap();
        let s = v.get("s").unwrap().as_str().unwrap().to_string();
        assert!(s.contains("line\nbreak"));
        assert!(s.contains('é'));
        assert!(s.contains('😀'));
        let again = parse(&serialize(&v)).unwrap();
        assert_eq!(v, again);
    }

    #[test]
    fn set_replaces_and_appends_fields() {
        let mut v = parse(r#"{"status":"active"}"#).unwrap();
        v.set("status", Value::Str("paused".into()));
        v.set("extra", Value::Num(1.0));
        assert_eq!(v.get("status").unwrap().as_str(), Some("paused"));
        assert_eq!(serialize(&v), r#"{"status":"paused","extra":1}"#);
    }

    #[test]
    fn rejects_malformed_input() {
        assert!(parse("{ not json").is_err());
        assert!(parse(r#"{"a":1,}"#).is_err());
        assert!(parse("").is_err());
        assert!(parse(r#"{"a":1} trailing"#).is_err());
    }

    #[test]
    fn integers_serialize_without_decimal_point() {
        let v = parse(r#"{"iterations":7,"score":0.5}"#).unwrap();
        assert_eq!(serialize(&v), r#"{"iterations":7,"score":0.5}"#);
    }
