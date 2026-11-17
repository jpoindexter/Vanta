// Rewritten by stage-native-deps.mjs: resolves the staged prebuilt binding
// directly instead of through the pre-gyp locator (see stageGetWindowsInto).
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const getAddon = () => {
	const require = createRequire(import.meta.url);
	const bindingRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'binding');

	try {
		for (const dir of fs.readdirSync(bindingRoot)) {
			const bindingPath = path.join(bindingRoot, dir, 'node-get-windows.node');
			if (fs.existsSync(bindingPath)) {
				return require(bindingPath);
			}
		}
	} catch {}

	return {
		getActiveWindow() {},
		getOpenWindows() {},
	};
};

export async function activeWindow() {
	return getAddon().getActiveWindow();
}

export function activeWindowSync() {
	return getAddon().getActiveWindow();
}

export function openWindows() {
	return getAddon().getOpenWindows();
}

export function openWindowsSync() {
	return getAddon().getOpenWindows();
}
