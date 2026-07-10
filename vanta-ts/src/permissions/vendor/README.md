# Vendored Bash grammar

`tree-sitter-bash.wasm` is copied from the MIT-licensed
`tree-sitter-bash@0.25.1` npm package.

- Upstream: https://github.com/tree-sitter/tree-sitter-bash
- SHA-256: `8292919c88a0f7d3fb31d0cd0253ca5a9531bc1ede82b0537f2c63dd8abe6a7a`
- License: `tree-sitter-bash.LICENSE`

Vanta uses the WASM grammar through `web-tree-sitter`. Vendoring only the
runtime asset avoids installing the package's unused native Node binding on
platforms such as Android/Termux.
