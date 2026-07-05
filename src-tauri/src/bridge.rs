use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
};
use tauri::Emitter;

use crate::webviews;

const TITLE_PREFIX: &str = "\u{200B}MAC1|";
const MAX_TITLE_FRAME_CHARS: usize = 900;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BridgeMessage {
    pub v: u8,
    pub action: String,
    pub provider: Option<String>,
    pub payload: Option<serde_json::Value>,
    pub transport: Option<String>,
    #[serde(rename = "bootId")]
    pub boot_id: Option<String>,
    pub seq: Option<u64>,
    pub mid: Option<u64>,
}

#[derive(Default)]
struct BridgeState {
    active_boot: HashMap<String, String>,
    last_seq: HashMap<(String, String), u64>,
}

static STATE: OnceLock<Mutex<BridgeState>> = OnceLock::new();

fn state() -> &'static Mutex<BridgeState> {
    STATE.get_or_init(|| Mutex::new(BridgeState::default()))
}

pub(crate) fn ingest_title(
    app: &tauri::AppHandle,
    provider: &str,
    title: &str,
) -> Option<BridgeMessage> {
    let mut msg = decode_title_frame(title).ok().flatten()?;
    let boot_id = msg.boot_id.clone()?;
    let seq = msg.seq?;
    let mut guard = state().lock().ok()?;
    rotate_boot_if_needed(&mut guard, provider, &boot_id);
    if !accept_seq(&mut guard, provider, &boot_id, seq) {
        return None;
    }
    drop(guard);

    msg.provider = Some(provider.to_string());
    msg.transport = Some("title".into());
    let _ = webviews::handle_bridge_title(app, provider, &msg);
    if is_title_action_allowed(&msg) {
        let _ = app.emit_to("main", "bridge://msg", &msg);
    }
    Some(msg)
}

fn is_title_action_allowed(msg: &BridgeMessage) -> bool {
    if msg.action != "STATUS_REPORT" {
        return false;
    }
    if let Some(payload) = msg.payload.as_ref() {
        if payload.get("bulkReady").is_some() {
            return true;
        }
    }
    true
}

fn accept_seq(state: &mut BridgeState, provider: &str, boot_id: &str, seq: u64) -> bool {
    let seq_key = (provider.to_string(), boot_id.to_string());
    if seq <= *state.last_seq.get(&seq_key).unwrap_or(&0) {
        return false;
    }
    state.last_seq.insert(seq_key, seq);
    true
}

fn rotate_boot_if_needed(state: &mut BridgeState, provider: &str, boot_id: &str) {
    if state
        .active_boot
        .get(provider)
        .is_some_and(|current| current != boot_id)
    {
        state
            .last_seq
            .retain(|(seq_provider, seq_boot), _| seq_provider != provider || seq_boot == boot_id);
    }
    state
        .active_boot
        .insert(provider.to_string(), boot_id.to_string());
}

fn decode_title_frame(title: &str) -> Result<Option<BridgeMessage>, String> {
    if !title.starts_with(TITLE_PREFIX) {
        return Ok(None);
    }
    if title.chars().count() > MAX_TITLE_FRAME_CHARS {
        return Err("title frame too large".into());
    }
    let rest = &title[TITLE_PREFIX.len()..];
    let mut parts = rest.split('|');
    let boot_id = parts.next().ok_or("missing bootId")?;
    let seq = parts
        .next()
        .ok_or("missing seq")?
        .parse::<u64>()
        .map_err(|error| error.to_string())?;
    let encoded = parts.next().ok_or("missing payload")?;
    if parts.next().is_some() {
        return Err("too many title fields".into());
    }
    let decoded = base64_url_decode_to_string(encoded)?;
    let mut msg: BridgeMessage =
        serde_json::from_str(&decoded).map_err(|error| error.to_string())?;
    msg.boot_id = Some(boot_id.to_string());
    msg.seq = Some(seq);
    Ok(Some(msg))
}

fn base64_url_decode_to_string(value: &str) -> Result<String, String> {
    let bytes = base64_url_decode(value)?;
    String::from_utf8(bytes).map_err(|error| error.to_string())
}

fn base64_url_decode(value: &str) -> Result<Vec<u8>, String> {
    let mut input = value.replace('-', "+").replace('_', "/");
    while input.len() % 4 != 0 {
        input.push('=');
    }
    let mut output = Vec::new();
    let mut chunk = [0u8; 4];
    for group in input.as_bytes().chunks(4) {
        for (idx, byte) in group.iter().enumerate() {
            chunk[idx] = decode_b64_byte(*byte)?;
        }
        output.push((chunk[0] << 2) | (chunk[1] >> 4));
        if group[2] != b'=' {
            output.push((chunk[1] << 4) | (chunk[2] >> 2));
        }
        if group[3] != b'=' {
            output.push((chunk[2] << 6) | chunk[3]);
        }
    }
    Ok(output)
}

fn decode_b64_byte(byte: u8) -> Result<u8, String> {
    match byte {
        b'A'..=b'Z' => Ok(byte - b'A'),
        b'a'..=b'z' => Ok(byte - b'a' + 26),
        b'0'..=b'9' => Ok(byte - b'0' + 52),
        b'+' => Ok(62),
        b'/' => Ok(63),
        b'=' => Ok(0),
        _ => Err(format!("invalid base64 byte {byte}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encode_for_test(value: &str) -> String {
        const TABLE: &[u8; 64] =
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        let bytes = value.as_bytes();
        let mut out = String::new();
        for chunk in bytes.chunks(3) {
            let a = chunk[0];
            let b = *chunk.get(1).unwrap_or(&0);
            let c = *chunk.get(2).unwrap_or(&0);
            out.push(TABLE[(a >> 2) as usize] as char);
            out.push(TABLE[(((a & 0b0000_0011) << 4) | (b >> 4)) as usize] as char);
            if chunk.len() > 1 {
                out.push(TABLE[(((b & 0b0000_1111) << 2) | (c >> 6)) as usize] as char);
            }
            if chunk.len() > 2 {
                out.push(TABLE[(c & 0b0011_1111) as usize] as char);
            }
        }
        out
    }

    #[test]
    fn title_dedup_core_decode() {
        let json = r#"{"v":1,"action":"STATUS_REPORT","bootId":"boot1","seq":1}"#;
        let frame = format!("{TITLE_PREFIX}boot1|1|{}", encode_for_test(json));
        let decoded = decode_title_frame(&frame).unwrap().unwrap();
        assert_eq!(decoded.boot_id.as_deref(), Some("boot1"));
        assert_eq!(decoded.seq, Some(1));
        assert!(decode_title_frame("normal title").unwrap().is_none());

        let mut state = BridgeState::default();
        rotate_boot_if_needed(&mut state, "chatgpt", "boot1");
        assert!(accept_seq(&mut state, "chatgpt", "boot1", 1));
        assert!(!accept_seq(&mut state, "chatgpt", "boot1", 1));
        assert!(!accept_seq(&mut state, "chatgpt", "boot1", 0));
        assert!(accept_seq(&mut state, "chatgpt", "boot1", 2));
    }

    #[test]
    fn rejects_large_title_frame() {
        let title = format!("{TITLE_PREFIX}boot1|1|{}", "a".repeat(901));
        assert!(decode_title_frame(&title).is_err());
    }

    #[test]
    fn title_action_allowlist_drops_authoritative_actions() {
        let done = BridgeMessage {
            v: 1,
            action: "RESPONSE_DONE".into(),
            provider: Some("chatgpt".into()),
            payload: None,
            transport: Some("title".into()),
            boot_id: Some("boot1".into()),
            seq: Some(1),
            mid: None,
        };
        assert!(!is_title_action_allowed(&done));
    }

    #[test]
    fn boot_rotation_drops_old_seq_core() {
        let mut state = BridgeState::default();
        state.active_boot.insert("chatgpt".into(), "old".into());
        state.last_seq.insert(("chatgpt".into(), "old".into()), 3);
        rotate_boot_if_needed(&mut state, "chatgpt", "new");
        assert!(state.last_seq.is_empty());
        assert_eq!(
            state.active_boot.get("chatgpt").map(String::as_str),
            Some("new")
        );
    }
}
