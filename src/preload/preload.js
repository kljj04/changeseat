const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('seatApp', {
	saveClassroom: (payload) => ipcRenderer.invoke('classroom:save', payload),
	loadClassroom: () => ipcRenderer.invoke('classroom:load'),
	saveData: (payload) => ipcRenderer.invoke('data:save', payload),
	loadData: () => ipcRenderer.invoke('data:load'),
});
