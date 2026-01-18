use std::{env, fs};

fn extract_json_string_field(content: &str, field: &str) -> Option<String> {
    let needle = format!("\"{}\"", field);
    let start = content.find(&needle)?;
    let after_key = &content[start + needle.len()..];
    let colon = after_key.find(':')?;
    let after_colon = after_key[colon + 1..].trim_start();

    // Expecting: "value"
    let after_quote = after_colon.strip_prefix('"')?;
    let end_quote = after_quote.find('"')?;
    Some(after_quote[..end_quote].to_string())
}

fn main() {
    // Ensure versions are kept in sync. Single source of truth: ../package.json#version
    // This prevents accidentally building with mismatched version fields.
    println!("cargo:rerun-if-changed=../package.json");
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=Cargo.toml");

    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let package_json_path = format!("{}/../package.json", manifest_dir);
    let tauri_conf_path = format!("{}/tauri.conf.json", manifest_dir);

    let package_json = fs::read_to_string(&package_json_path)
        .unwrap_or_else(|e| panic!("Failed to read {}: {}", package_json_path, e));
    let pkg_version = extract_json_string_field(&package_json, "version")
        .unwrap_or_else(|| panic!("Failed to parse version from {}", package_json_path));

    let cargo_version = env::var("CARGO_PKG_VERSION").unwrap_or_else(|_| "unknown".to_string());
    if cargo_version != pkg_version {
        panic!(
            "Version mismatch: package.json({}) != src-tauri/Cargo.toml({}).\n\
Run `npm run sync:version` (or update Cargo.toml) before building.",
            pkg_version, cargo_version
        );
    }

    let tauri_conf = fs::read_to_string(&tauri_conf_path)
        .unwrap_or_else(|e| panic!("Failed to read {}: {}", tauri_conf_path, e));
    let tauri_version = extract_json_string_field(&tauri_conf, "version")
        .unwrap_or_else(|| panic!("Failed to parse version from {}", tauri_conf_path));
    if tauri_version != pkg_version {
        panic!(
            "Version mismatch: package.json({}) != src-tauri/tauri.conf.json({}).\n\
Run `npm run sync:version` (or update tauri.conf.json) before building.",
            pkg_version, tauri_version
        );
    }

    tauri_build::build()
}
