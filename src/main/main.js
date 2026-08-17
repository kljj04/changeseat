const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');

function getDataPath() {
	return path.join(app.getPath('userData'), 'seat-data.json');
}

function getLegacyDataPath() {
	return path.join(__dirname, '..', '..', 'data', 'seat-data.json');
}

function createWindow() {
	const win = new BrowserWindow({
		width: 1280,
		height: 820,
		minWidth: 980,
		minHeight: 680,
		backgroundColor: '#1e1e1e',
		title: 'SeatChanger',
		webPreferences: {
			preload: path.join(__dirname, '..', 'preload', 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

async function ensureDataDir() {
	await fs.mkdir(path.dirname(getDataPath()), { recursive: true });
}

ipcMain.handle('data:load', async () => {
	const dataPath = getDataPath();
	const legacyDataPath = getLegacyDataPath();

	try {
		const content = await fs.readFile(dataPath, 'utf8');
		return {
			ok: true,
			data: JSON.parse(content),
			filePath: dataPath,
		};
	} catch (error) {
		if (error.code === 'ENOENT') {
			try {
				const content = await fs.readFile(legacyDataPath, 'utf8');
				return {
					ok: true,
					data: JSON.parse(content),
					filePath: legacyDataPath,
					legacy: true,
				};
			} catch (legacyError) {
				if (legacyError.code === 'ENOENT') {
					return { ok: false, missing: true, filePath: dataPath };
				}

				throw legacyError;
			}
		}

		throw error;
	}
});

ipcMain.handle('data:save', async (_event, payload) => {
	const dataPath = getDataPath();

	await ensureDataDir();
	await fs.writeFile(dataPath, `${JSON.stringify(payload, null, '\t')}\n`, 'utf8');
	return { ok: true, filePath: dataPath };
});

ipcMain.handle('classroom:save', async (_event, payload) => {
	const { canceled, filePath } = await dialog.showSaveDialog({
		title: '자리표 저장',
		defaultPath: 'seat-plan.json',
		filters: [
			{ name: 'Seat Plan', extensions: ['json'] },
		],
	});

	if (canceled || !filePath) {
		return { ok: false, canceled: true };
	}

	await fs.writeFile(filePath, `${JSON.stringify(payload, null, '\t')}\n`, 'utf8');
	return { ok: true, filePath };
});

ipcMain.handle('classroom:load', async () => {
	const { canceled, filePaths } = await dialog.showOpenDialog({
		title: '자리표 불러오기',
		properties: ['openFile'],
		filters: [
			{ name: 'Seat Plan', extensions: ['json'] },
		],
	});

	if (canceled || filePaths.length === 0) {
		return { ok: false, canceled: true };
	}

	const content = await fs.readFile(filePaths[0], 'utf8');
	return {
		ok: true,
		filePath: filePaths[0],
		data: JSON.parse(content),
	};
});

app.whenReady().then(() => {
	createWindow();

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});
