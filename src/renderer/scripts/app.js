import { createSeat, makeEmptySeatLayout, makeSeatPlan, parseStudents, snap, shuffle } from './seats.js';
import { normalizeClassroom, normalizeLoadedState, snapshotState } from './storage.js';
import { renderGallery, renderPhotoPreview, renderSeats, setMessage, sleep, updateSeatElement } from './ui.js';

const elements = {
	tabButtons: [...document.querySelectorAll('.tab-button')],
	pages: [...document.querySelectorAll('.page')],
	pageTitle: document.querySelector('#pageTitle'),
	message: document.querySelector('#message'),
	sidebarSummary: document.querySelector('#sidebarSummary'),
	hamburgerButton: document.querySelector('#hamburgerButton'),
	hamburgerPanel: document.querySelector('#hamburgerPanel'),
	closeHamburgerButton: document.querySelector('#closeHamburgerButton'),
	avoidPairsInput: document.querySelector('#avoidPairsInput'),
	preferPairsInput: document.querySelector('#preferPairsInput'),
	radiusAvoidPairsInput: document.querySelector('#radiusAvoidPairsInput'),
	saveConstraintsButton: document.querySelector('#saveConstraintsButton'),
	goDashboardTopButton: document.querySelector('#goDashboardTopButton'),
	toggleChangerPanelButton: document.querySelector('#toggleChangerPanelButton'),
	zoomOutButton: document.querySelector('#zoomOutButton'),
	zoomInButton: document.querySelector('#zoomInButton'),
	resetZoomButton: document.querySelector('#resetZoomButton'),
	deleteClassButton: document.querySelector('#deleteClassButton'),
	galleryBoard: document.querySelector('#galleryBoard'),
	captureOverlay: document.querySelector('#captureOverlay'),
	photoPreview: document.querySelector('#photoPreview'),
	saveGalleryButton: document.querySelector('#saveGalleryButton'),
	discardGalleryButton: document.querySelector('#discardGalleryButton'),
	viewerOverlay: document.querySelector('#viewerOverlay'),
	viewerPhoto: document.querySelector('#viewerPhoto'),
	viewerZoomOutButton: document.querySelector('#viewerZoomOutButton'),
	viewerZoomInButton: document.querySelector('#viewerZoomInButton'),
	viewerZoomResetButton: document.querySelector('#viewerZoomResetButton'),
	closeViewerButton: document.querySelector('#closeViewerButton'),

	quickClassName: document.querySelector('#quickClassName'),
	quickAddClassButton: document.querySelector('#quickAddClassButton'),
	quickStudentInput: document.querySelector('#quickStudentInput'),
	quickApplyStudentsButton: document.querySelector('#quickApplyStudentsButton'),
	goChangerButton: document.querySelector('#goChangerButton'),
	dashClassName: document.querySelector('#dashClassName'),
	dashStudentCount: document.querySelector('#dashStudentCount'),
	dashSeatCount: document.querySelector('#dashSeatCount'),

	classList: document.querySelector('#classList'),

	studentClassSelect: document.querySelector('#studentClassSelect'),
	studentInput: document.querySelector('#studentInput'),

	changerClassSelect: document.querySelector('#changerClassSelect'),
	changerStudentCount: document.querySelector('#changerStudentCount'),
	changerSeatCount: document.querySelector('#changerSeatCount'),
	shuffleButton: document.querySelector('#shuffleButton'),
	saveButton: document.querySelector('#saveButton'),
	loadButton: document.querySelector('#loadButton'),
	addSeatButton: document.querySelector('#addSeatButton'),
	deleteSeatButton: document.querySelector('#deleteSeatButton'),
	seatCanvas: document.querySelector('#seatCanvas'),
};

const pageTitles = {
	dashboard: '대시보드',
	classes: '내 반',
	students: '학생 목록',
	changer: '자리바꾸기',
	gallery: '갤러리',
	settings: '설정',
};

let state = {
	activeTab: 'dashboard',
	currentClassId: null,
	classes: [],
	gallery: [],
	zoom: 1,
	photoZoom: 1,
	changerPanelOpen: true,
};

let selectedIndex = -1;
let swapIndex = -1;
let drag = null;
let pendingPhoto = null;
let viewerPhotoId = null;
let saveTimer = null;

function activeClass() {
	return state.classes.find((classroom) => classroom.id === state.currentClassId) || null;
}

function ensureDefaultClass() {
	if (state.classes.length > 0) {
		if (!activeClass()) {
			state.currentClassId = state.classes[0].id;
		}
		return;
	}

	const classroom = createClassroom('1반');
	state.classes.push(classroom);
	state.currentClassId = classroom.id;
}

function createClassroom(name) {
	return normalizeClassroom({
		id: `class-${Date.now()}-${Math.random().toString(16).slice(2)}`,
		name,
		students: [],
		rows: 5,
		cols: 6,
		seats: makeEmptySeatLayout(5, 6),
	});
}

function setTab(tab) {
	state.activeTab = tab;
	document.body.classList.toggle('changer-mode', tab === 'changer');
	document.body.classList.toggle('changer-panel-closed', tab === 'changer' && !state.changerPanelOpen);
	closeHamburgerPanel();

	for (const button of elements.tabButtons) {
		button.classList.toggle('active', button.dataset.tab === tab);
	}

	for (const page of elements.pages) {
		page.classList.toggle('active', page.dataset.page === tab);
	}

	elements.pageTitle.textContent = pageTitles[tab] || 'SeatChanger';
	renderAll();
}

function markDirty() {
	if (saveTimer) {
		clearTimeout(saveTimer);
	}

	saveTimer = setTimeout(savePermanentData, 250);
}

async function savePermanentData() {
	saveTimer = null;

	try {
		await window.seatApp.saveData(snapshotState({
			classes: state.classes,
			currentClassId: state.currentClassId,
			gallery: state.gallery,
			zoom: state.zoom,
		}));
	} catch (error) {
		setMessage(elements.message, `자동 저장 실패: ${error.message}`, 'error');
	}
}

async function loadPermanentData() {
	let result;

	try {
		result = await window.seatApp.loadData();
	} catch (error) {
		setMessage(elements.message, `DATA 로드 실패: ${error.message}`, 'error');
		return;
	}

	if (!result.ok) {
		return;
	}

	const loaded = normalizeLoadedState(result.data);
	state.classes = loaded.classes;
	state.currentClassId = loaded.currentClassId;
	state.gallery = loaded.gallery || [];
	state.zoom = loaded.zoom || 1;
}

function setZoom(value) {
	state.zoom = Math.max(0.25, Math.min(5, Number(value || 1)));
	elements.seatCanvas.style.setProperty('--zoom', state.zoom);
	document.querySelector('#classroomGrid')?.style.setProperty('--grid-size', `${20 * state.zoom}px`);
	setMessage(elements.message, `확대율 ${Math.round(state.zoom * 100)}%`, 'normal');
}

function toggleChangerPanel() {
	state.changerPanelOpen = !state.changerPanelOpen;
	document.body.classList.toggle('changer-panel-closed', state.activeTab === 'changer' && !state.changerPanelOpen);
}

function toggleHamburgerPanel() {
	elements.hamburgerPanel.classList.toggle('open');
}

function closeHamburgerPanel() {
	elements.hamburgerPanel.classList.remove('open');
}

function addClass(rawName) {
	const name = String(rawName || '').trim();

	if (!name) {
		setMessage(elements.message, '반 이름을 입력해.', 'error');
		return null;
	}

	const classroom = createClassroom(name);
	state.classes.push(classroom);
	state.currentClassId = classroom.id;
	selectedIndex = -1;
	swapIndex = -1;
	setMessage(elements.message, `${name} 추가됨.`, 'success');
	renderAll();
	markDirty();
	return classroom;
}

function selectClass(classId) {
	if (!state.classes.some((classroom) => classroom.id === classId)) {
		return;
	}

	state.currentClassId = classId;
	selectedIndex = -1;
	swapIndex = -1;
	renderAll();
	markDirty();
}

function deleteActiveClass() {
	const classroom = activeClass();

	if (!classroom) {
		setMessage(elements.message, '삭제할 반이 없음.', 'error');
		return;
	}

	state.classes = state.classes.filter((item) => item.id !== classroom.id);
	state.currentClassId = state.classes[0]?.id || null;
	selectedIndex = -1;
	swapIndex = -1;
	setMessage(elements.message, `${classroom.name} 삭제됨.`, 'success');
	renderAll();
	markDirty();
}

function applyStudents(rawText) {
	const classroom = activeClass();

	if (!classroom) {
		setMessage(elements.message, '선택된 반이 없음.', 'error');
		return;
	}

	classroom.students = parseStudents(rawText);
	classroom.seats = mergeSeatNames(classroom.seats, makeSeatPlan(classroom.students, 1, classroom.seats.length));
	setMessage(elements.message, '학생 목록 저장됨.', 'success');
	renderAll();
	markDirty();
}

function clearStudents() {
	const classroom = activeClass();

	if (!classroom) {
		return;
	}

	classroom.students = [];
	classroom.seats = classroom.seats.map((seat) => ({ ...seat, name: '', studentNumber: null }));
	setMessage(elements.message, '학생 목록 비움.', 'success');
	renderAll();
	markDirty();
}

function mergeSeatNames(layoutSeats, plannedSeats) {
	return layoutSeats.map((seat, index) => ({
		...seat,
		name: plannedSeats[index]?.name || '',
		studentNumber: plannedSeats[index]?.studentNumber ?? null,
	}));
}

async function shuffleSeats() {
	const classroom = activeClass();

	if (!classroom) {
		setMessage(elements.message, '선택된 반이 없음.', 'error');
		return;
	}

	if (classroom.students.length === 0) {
		setMessage(elements.message, '학생 목록이 비어있음.', 'error');
		return;
	}

	if (classroom.students.length > classroom.seats.length) {
		setMessage(elements.message, '학생 수가 좌석 수보다 많음.', 'error');
		return;
	}

	classroom.constraints = readConstraintsFromInputs();
	elements.shuffleButton.disabled = true;
	setMessage(elements.message, '섞는 중...', 'normal');

	try {
		selectedIndex = -1;
		swapIndex = -1;
		classroom.seats = sortSeatsForShuffle(classroom.seats);
		const finalSeats = shuffleSeatNamesWithFixed(classroom);
		document.body.classList.add('shuffling-text');
		await animateShuffle(classroom, finalSeats);
		renderAll();
		document.body.classList.add('shutter-on');
		document.body.classList.add('screen-captured');
		await sleep(620);
		document.body.classList.remove('shuffling-text');
		document.body.classList.remove('shutter-on');
		document.body.classList.remove('screen-captured');
		await openCapturePrompt(classroom);

		setMessage(elements.message, '자리 배치 완료.', 'success');
		markDirty();
	} catch (error) {
		setMessage(elements.message, `자리 배치 실패: ${error.message}`, 'error');
	} finally {
		document.body.classList.remove('shuffling-text');
		document.body.classList.remove('shutter-on');
		document.body.classList.remove('screen-captured');
		elements.shuffleButton.disabled = false;
	}
}

async function animateShuffle(classroom, finalSeats) {
	const original = classroom.seats.map((seat) => ({ ...seat }));

	for (let step = 0; step < 12; step += 1) {
		const shuffled = shuffle(getShufflePool(classroom));
		let cursor = 0;

		classroom.seats = original.map((seat) => {
			if (seat.fixed) {
				return seat;
			}

			const picked = shuffled[cursor] || { name: '', studentNumber: null };
			cursor += 1;
			return {
				...seat,
				name: picked?.name || '',
				studentNumber: picked?.studentNumber ?? null,
			};
		});
		renderAll();
		await sleep(240);
	}

	classroom.seats = finalSeats;
	renderAll();
}

function shuffleSeatNamesWithFixed(classroom) {
	const constraints = getPairConstraints(classroom);
	let bestSeats = null;
	let bestScore = Number.POSITIVE_INFINITY;

	for (let attempt = 0; attempt < 180; attempt += 1) {
		const candidate = assignShuffledPool(classroom);
		applyPreferredPairs(candidate, constraints.preferPairs);
		const score = countAvoidPairConflicts(candidate, constraints.avoidPairs) + countPreferPairMisses(candidate, constraints.preferPairs);

		if (score < bestScore) {
			bestSeats = candidate;
			bestScore = score;
		}

		if (score === 0) {
			return candidate;
		}
	}

	const finalSeats = bestSeats || assignShuffledPool(classroom);
	applyPreferredPairs(finalSeats, constraints.preferPairs, { overrideFixed: true });
	return finalSeats;
}

function assignShuffledPool(classroom) {
	const pool = shuffle(getShufflePool(classroom));
	let cursor = 0;

	return classroom.seats.map((seat) => {
		if (seat.fixed) {
			return seat;
		}

		const picked = pool[cursor] || { name: '', studentNumber: null };
		cursor += 1;

		return {
			...seat,
			name: picked.name,
			studentNumber: picked.studentNumber,
		};
	});
}

function getPairConstraints(classroom) {
	return {
		avoidPairs: parseNamePairs(classroom.constraints?.avoidPairs),
		preferPairs: parseNamePairs(classroom.constraints?.preferPairs),
	};
}

function parseNamePairs(rawText) {
	return String(rawText || '')
		.split(/\r?\n/)
		.map((line) => line.split(/[,\t/|]+/).map((value) => value.trim()).filter(Boolean))
		.filter((parts) => parts.length >= 2)
		.map(([first, second]) => [first, second]);
}

function applyPreferredPairs(seats, pairs, options = {}) {
	if (pairs.length === 0) {
		return;
	}

	const overrideFixed = Boolean(options.overrideFixed);

	for (const [firstName, secondName] of pairs) {
		const pairMap = buildSeatPairMap(seats);
		const firstIndex = findSeatIndexByName(seats, firstName);
		const secondIndex = findSeatIndexByName(seats, secondName);

		if (firstIndex < 0 || secondIndex < 0 || pairMap.get(firstIndex) === secondIndex) {
			continue;
		}

		const firstPartner = pairMap.get(firstIndex);
		const secondPartner = pairMap.get(secondIndex);

		if ((overrideFixed || seats[firstIndex].fixed) && firstPartner !== undefined && (overrideFixed || !seats[firstPartner].fixed)) {
			moveStudentToSeat(seats, secondName, firstPartner, { overrideFixed });
			continue;
		}

		if ((overrideFixed || seats[secondIndex].fixed) && secondPartner !== undefined && (overrideFixed || !seats[secondPartner].fixed)) {
			moveStudentToSeat(seats, firstName, secondPartner, { overrideFixed });
			continue;
		}

		if (!seats[firstIndex].fixed && firstPartner !== undefined && !seats[firstPartner].fixed) {
			moveStudentToSeat(seats, secondName, firstPartner, { overrideFixed });
			continue;
		}

		if (!seats[secondIndex].fixed && secondPartner !== undefined && !seats[secondPartner].fixed) {
			moveStudentToSeat(seats, firstName, secondPartner, { overrideFixed });
			continue;
		}

		const targetPair = findOpenPair(seats, pairMap);

		if (!targetPair) {
			continue;
		}

		moveStudentToSeat(seats, firstName, targetPair[0], { overrideFixed });
		moveStudentToSeat(seats, secondName, targetPair[1], { overrideFixed });
	}
}

function countAvoidPairConflicts(seats, pairs) {
	if (pairs.length === 0) {
		return 0;
	}

	const pairMap = buildSeatPairMap(seats);
	let count = 0;

	for (const [firstName, secondName] of pairs) {
		const firstIndex = findSeatIndexByName(seats, firstName);
		const secondIndex = findSeatIndexByName(seats, secondName);

		if (firstIndex >= 0 && secondIndex >= 0 && pairMap.get(firstIndex) === secondIndex) {
			count += 1;
		}
	}

	return count;
}

function countPreferPairMisses(seats, pairs) {
	if (pairs.length === 0) {
		return 0;
	}

	const pairMap = buildSeatPairMap(seats);
	let count = 0;

	for (const [firstName, secondName] of pairs) {
		const firstIndex = findSeatIndexByName(seats, firstName);
		const secondIndex = findSeatIndexByName(seats, secondName);

		if (firstIndex >= 0 && secondIndex >= 0 && pairMap.get(firstIndex) !== secondIndex) {
			count += 1;
		}
	}

	return count;
}

function getShufflePool(classroom) {
	const fixedNumbers = new Set(
		classroom.seats
			.filter((seat) => seat.fixed && seat.studentNumber !== null)
			.map((seat) => Number(seat.studentNumber)),
	);
	const fixedNames = new Set(
		classroom.seats
			.filter((seat) => seat.fixed && seat.name)
			.map((seat) => seat.name),
	);
	const pool = classroom.students
		.map((name, index) => ({
			name,
			studentNumber: index + 1,
		}))
		.filter((student) => !fixedNumbers.has(student.studentNumber) && !fixedNames.has(student.name));
	const openSeatCount = classroom.seats.filter((seat) => !seat.fixed).length;

	while (pool.length < openSeatCount) {
		pool.push({ name: '', studentNumber: null });
	}

	return pool.slice(0, openSeatCount);
}

function sortSeatsForShuffle(seats) {
	return [...seats].sort((first, second) => {
		const yDiff = Number(first.y || 0) - Number(second.y || 0);

		if (Math.abs(yDiff) >= 20) {
			return yDiff;
		}

		const xDiff = Number(first.x || 0) - Number(second.x || 0);

		if (xDiff !== 0) {
			return xDiff;
		}

		return String(first.id || '').localeCompare(String(second.id || ''));
	});
}

function buildSeatPairMap(seats) {
	const rows = [];
	const sortedEntries = seats
		.map((seat, index) => ({
			index,
			x: Number(seat.x || 0),
			y: Number(seat.y || 0),
		}))
		.sort((first, second) => {
			const yDiff = first.y - second.y;

			if (Math.abs(yDiff) >= 20) {
				return yDiff;
			}

			return first.x - second.x;
		});

	for (const entry of sortedEntries) {
		const row = rows.find((item) => Math.abs(item.y - entry.y) < 20);

		if (row) {
			row.items.push(entry);
			continue;
		}

		rows.push({
			y: entry.y,
			items: [entry],
		});
	}

	const pairMap = new Map();

	for (const row of rows) {
		row.items.sort((first, second) => first.x - second.x);

		for (let index = 0; index < row.items.length - 1; index += 2) {
			const first = row.items[index].index;
			const second = row.items[index + 1].index;
			pairMap.set(first, second);
			pairMap.set(second, first);
		}
	}

	return pairMap;
}

function findSeatIndexByName(seats, name) {
	const normalized = normalizeName(name);
	return seats.findIndex((seat) => normalizeName(seat.name) === normalized);
}

function normalizeName(value) {
	return String(value || '').trim();
}

function moveStudentToSeat(seats, studentName, targetIndex, options = {}) {
	const currentIndex = findSeatIndexByName(seats, studentName);

	if (currentIndex < 0 || targetIndex < 0 || !seats[targetIndex]) {
		return false;
	}

	if (currentIndex === targetIndex) {
		return true;
	}

	if (!options.overrideFixed && (seats[currentIndex].fixed || seats[targetIndex].fixed)) {
		return false;
	}

	swapSeatAssignments(seats[currentIndex], seats[targetIndex]);
	return true;
}

function findOpenPair(seats, pairMap) {
	for (const [first, second] of pairMap.entries()) {
		if (first > second) {
			continue;
		}

		if (!seats[first]?.fixed && !seats[second]?.fixed) {
			return [first, second];
		}
	}

	return null;
}

function addSeat() {
	const classroom = activeClass();

	if (!classroom) {
		return;
	}

	const next = createSeat(classroom.seats.length, '', classroom.cols);
	next.x = snap(40 + (classroom.seats.length % Math.max(1, classroom.cols)) * 100);
	next.y = snap(70 + Math.floor(classroom.seats.length / Math.max(1, classroom.cols)) * 60);
	classroom.seats.push(next);
	selectedIndex = classroom.seats.length - 1;
	swapIndex = selectedIndex;
	renderAll();
	setMessage(elements.message, '좌석 추가 완료.', 'success');
	markDirty();
}

function deleteSelectedSeat() {
	const classroom = activeClass();

	if (!classroom || selectedIndex < 0 || !classroom.seats[selectedIndex]) {
		setMessage(elements.message, '먼저 좌석을 선택해.', 'error');
		return;
	}

	classroom.seats.splice(selectedIndex, 1);
	selectedIndex = -1;
	swapIndex = -1;
	renderAll();
	setMessage(elements.message, '선택 좌석 삭제 완료.', 'success');
	markDirty();
}

async function save() {
	const payload = snapshotState({
		classes: state.classes,
		currentClassId: state.currentClassId,
		gallery: state.gallery,
		zoom: state.zoom,
	});

	const result = await window.seatApp.saveClassroom(payload);

	if (result.ok) {
		setMessage(elements.message, `저장됨: ${result.filePath}`, 'success');
	}
}

async function load() {
	const result = await window.seatApp.loadClassroom();

	if (!result.ok) {
		return;
	}

	const loaded = normalizeLoadedState(result.data);
	state.classes = loaded.classes;
	state.currentClassId = loaded.currentClassId;
	state.gallery = loaded.gallery || [];
	state.zoom = loaded.zoom || state.zoom;
	selectedIndex = -1;
	swapIndex = -1;
	renderAll();
	setZoom(state.zoom);
	setMessage(elements.message, `불러옴: ${result.filePath}`, 'success');
	markDirty();
}

function renderAll() {
	ensureDefaultClass();
	renderSidebarSummary();
	renderClassList();
	renderClassSelects();
	renderDashboard();
	renderStudentEditor();
	renderChanger();
	renderGallery(elements.galleryBoard, state.gallery, {
		onOpen: openGalleryPhoto,
		onLoad: loadGalleryPhoto,
		onDelete: deleteGalleryPhoto,
	});
}

function renderSidebarSummary() {
	const classroom = activeClass();
	const className = classroom?.name || '반 없음';
	const count = classroom?.students.length || 0;
	elements.sidebarSummary.textContent = `${className} / ${count}명`;
}

function renderDashboard() {
	const classroom = activeClass();
	elements.dashClassName.textContent = classroom?.name || '없음';
	elements.dashStudentCount.textContent = classroom?.students.length || 0;
	elements.dashSeatCount.textContent = classroom?.seats.length || 0;

	if (classroom && document.activeElement !== elements.quickStudentInput) {
		elements.quickStudentInput.value = classroom.students.join('\n');
	}
}

function renderClassList() {
	elements.classList.replaceChildren();

	for (const classroom of state.classes) {
		const row = document.createElement('div');
		row.className = `class-row${classroom.id === state.currentClassId ? ' selected' : ''}`;
		row.innerHTML = `
			<button class="class-select-button" type="button">
				<span>${escapeHtml(classroom.name)}</span>
				<small>${classroom.students.length}명 / ${classroom.seats.length}석</small>
			</button>
			<button class="class-delete-button" type="button">삭제</button>
		`;
		row.querySelector('.class-select-button').addEventListener('click', () => selectClass(classroom.id));
		row.querySelector('.class-delete-button').addEventListener('click', () => {
			selectClass(classroom.id);
			deleteActiveClass();
		});
		elements.classList.appendChild(row);
	}
}

function renderClassSelects() {
	const selects = [elements.studentClassSelect, elements.changerClassSelect];

	for (const select of selects) {
		const focused = document.activeElement === select;
		const oldValue = select.value;
		select.replaceChildren();

		for (const classroom of state.classes) {
			const option = document.createElement('option');
			option.value = classroom.id;
			option.textContent = classroom.name;
			option.selected = classroom.id === state.currentClassId;
			select.appendChild(option);
		}

		if (focused && state.classes.some((classroom) => classroom.id === oldValue)) {
			select.value = oldValue;
		}
	}
}

function renderStudentEditor() {
	const classroom = activeClass();

	if (!classroom) {
		elements.studentInput.value = '';
		return;
	}

	if (document.activeElement !== elements.studentInput) {
		elements.studentInput.value = classroom.students.join('\n');
	}
}

function renderChanger() {
	const classroom = activeClass();

	if (!classroom) {
		elements.changerStudentCount.textContent = '0';
		elements.changerSeatCount.textContent = '0';
		elements.avoidPairsInput.value = '';
		elements.preferPairsInput.value = '';
		elements.radiusAvoidPairsInput.value = '';
		renderSeats(elements.seatCanvas, [], -1);
		return;
	}

	elements.changerStudentCount.textContent = classroom.students.length;
	elements.changerSeatCount.textContent = classroom.seats.length;
	if (document.activeElement !== elements.avoidPairsInput) {
		elements.avoidPairsInput.value = classroom.constraints?.avoidPairs || '';
	}
	if (document.activeElement !== elements.preferPairsInput) {
		elements.preferPairsInput.value = classroom.constraints?.preferPairs || '';
	}
	if (document.activeElement !== elements.radiusAvoidPairsInput) {
		elements.radiusAvoidPairsInput.value = classroom.constraints?.radiusAvoidPairs || '';
	}
	renderSeats(elements.seatCanvas, classroom.seats, selectedIndex);
}

function saveConstraints() {
	const classroom = activeClass();

	if (!classroom) {
		setMessage(elements.message, '선택된 반이 없음.', 'error');
		return;
	}

	classroom.constraints = readConstraintsFromInputs();

	setMessage(elements.message, '조건 저장됨.', 'success');
	closeHamburgerPanel();
	markDirty();
}

function readConstraintsFromInputs() {
	return {
		avoidPairs: elements.avoidPairsInput.value,
		preferPairs: elements.preferPairsInput.value,
		radiusAvoidPairs: elements.radiusAvoidPairsInput.value,
	};
}

async function openCapturePrompt(classroom) {
	const boardRect = elements.seatCanvas.closest('#classroomGrid')?.getBoundingClientRect();

	pendingPhoto = {
		id: `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
		classId: classroom.id,
		className: classroom.name,
		createdAt: new Date().toISOString(),
		students: [...classroom.students],
		rows: classroom.rows,
		cols: classroom.cols,
		zoom: state.zoom,
		imageData: null,
		imageWidth: null,
		imageHeight: null,
		boardWidth: Math.round(boardRect?.width || 0) || null,
		boardHeight: Math.round(boardRect?.height || 0) || null,
		seats: classroom.seats.map((seat) => ({ ...seat })),
	};

	renderPhotoPreview(elements.photoPreview, pendingPhoto);
	elements.captureOverlay.classList.add('open');
}

function closeCapturePrompt() {
	elements.captureOverlay.classList.remove('open');
	pendingPhoto = null;
}

function savePendingPhoto() {
	if (!pendingPhoto) {
		return;
	}

	state.gallery.unshift(pendingPhoto);
	closeCapturePrompt();
	renderGallery(elements.galleryBoard, state.gallery, {
		onOpen: openGalleryPhoto,
		onLoad: loadGalleryPhoto,
		onDelete: deleteGalleryPhoto,
	});
	setMessage(elements.message, '갤러리에 핀으로 저장됨.', 'success');
	document.body.classList.add('gallery-fly');
	setTimeout(() => document.body.classList.remove('gallery-fly'), 700);
	markDirty();
}

function findGalleryPhoto(photoId) {
	return state.gallery.find((photo) => photo.id === photoId) || null;
}

function openGalleryPhoto(photoId) {
	const photo = findGalleryPhoto(photoId);

	if (!photo) {
		return;
	}

	viewerPhotoId = photoId;
	state.photoZoom = 1;
	renderViewerPhoto();
	elements.viewerOverlay.classList.add('open');
}

function closeGalleryViewer() {
	elements.viewerOverlay.classList.remove('open');
	viewerPhotoId = null;
}

function renderViewerPhoto() {
	const photo = findGalleryPhoto(viewerPhotoId);

	if (!photo) {
		return;
	}

	renderPhotoPreview(elements.viewerPhoto, photo, { scale: state.photoZoom });
}

function setPhotoZoom(value) {
	state.photoZoom = Math.max(0.5, Math.min(4, Number(value || 1)));
	renderViewerPhoto();
	setMessage(elements.message, `사진 확대율 ${Math.round(state.photoZoom * 100)}%`, 'normal');
}

function loadGalleryPhoto(photoId) {
	const photo = findGalleryPhoto(photoId);

	if (!photo) {
		return;
	}

	let classroom = state.classes.find((item) => item.id === photo.classId);

	if (!classroom) {
		classroom = createClassroom(photo.className);
		classroom.id = photo.classId || classroom.id;
		state.classes.push(classroom);
	}

	classroom.name = photo.className;
	classroom.students = [...(photo.students || [])];
	classroom.rows = photo.rows || classroom.rows;
	classroom.cols = photo.cols || classroom.cols;
	classroom.seats = photo.seats.map((seat) => ({ ...seat, fixed: Boolean(seat.fixed) }));
	state.currentClassId = classroom.id;
	selectedIndex = -1;
	swapIndex = -1;
	setZoom(photo.zoom || state.zoom);
	setTab('changer');
	setMessage(elements.message, '갤러리 시점 불러옴.', 'success');
	markDirty();
}

function deleteGalleryPhoto(photoId) {
	state.gallery = state.gallery.filter((photo) => photo.id !== photoId);
	renderAll();
	setMessage(elements.message, '갤러리 사진 삭제됨.', 'success');
	markDirty();
}

function markSelectedSeat(index) {
	for (const seat of elements.seatCanvas.querySelectorAll('.seat')) {
		seat.classList.toggle('selected', Number(seat.dataset.index) === index);
	}
}

function startDrag(event) {
	const lockElement = event.target.closest('.seat-lock');
	if (lockElement) {
		event.preventDefault();
		event.stopPropagation();
		toggleSeatFixed(Number(lockElement.closest('.seat')?.dataset.index));
		return;
	}

	const seatElement = event.target.closest('.seat');
	const classroom = activeClass();

	if (!seatElement || !classroom) {
		selectedIndex = -1;
		renderAll();
		return;
	}

	const index = Number(seatElement.dataset.index);
	const seat = classroom.seats[index];

	if (!seat) {
		return;
	}

	selectedIndex = index;
	markSelectedSeat(index);
	seatElement.classList.add('dragging');
	seatElement.setPointerCapture(event.pointerId);

	drag = {
		pointerId: event.pointerId,
		index,
		element: seatElement,
		startX: event.clientX,
		startY: event.clientY,
		originX: seat.x,
		originY: seat.y,
		moved: false,
	};
}

function moveDrag(event) {
	const classroom = activeClass();

	if (!drag || !classroom || event.pointerId !== drag.pointerId) {
		return;
	}

	const seat = classroom.seats[drag.index];

	if (!seat) {
		return;
	}

	const deltaX = event.clientX - drag.startX;
	const deltaY = event.clientY - drag.startY;
	if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
		drag.moved = true;
	}

	if (!drag.moved) {
		return;
	}

	seat.x = snap(drag.originX + deltaX / state.zoom);
	seat.y = snap(drag.originY + deltaY / state.zoom);
	updateSeatElement(drag.element, seat);
}

function endDrag(event) {
	if (!drag || event.pointerId !== drag.pointerId) {
		return;
	}

	try {
		drag.element.releasePointerCapture(event.pointerId);
	} catch {}

	drag.element.classList.remove('dragging');
	const clickedIndex = drag.moved ? -1 : drag.index;
	drag = null;

	if (clickedIndex >= 0) {
		handleSeatClick(clickedIndex);
		return;
	}

	markDirty();
}

function toggleSeatFixed(index) {
	const classroom = activeClass();
	const seat = classroom?.seats[index];

	if (!seat) {
		return;
	}

	seat.fixed = !seat.fixed;
	selectedIndex = index;
	swapIndex = index;
	renderAll();
	setMessage(elements.message, seat.fixed ? '좌석 고정됨.' : '좌석 고정 해제됨.', 'success');
	markDirty();
}

function handleSeatClick(index) {
	const classroom = activeClass();

	if (!classroom?.seats[index]) {
		return;
	}

	if (swapIndex < 0 || swapIndex === index || !classroom.seats[swapIndex]) {
		swapIndex = index;
		selectedIndex = index;
		markSelectedSeat(index);
		setMessage(elements.message, '스왑할 다른 좌석을 눌러.', 'normal');
		return;
	}

	swapSeatAssignments(classroom.seats[swapIndex], classroom.seats[index]);
	selectedIndex = index;
	swapIndex = -1;
	renderAll();
	setMessage(elements.message, '좌석 스왑 완료.', 'success');
	markDirty();
}

function swapSeatAssignments(first, second) {
	const firstName = first.name;
	const firstNumber = first.studentNumber;
	first.name = second.name;
	first.studentNumber = second.studentNumber;
	second.name = firstName;
	second.studentNumber = firstNumber;
}

function escapeHtml(value) {
	return String(value || '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}

elements.tabButtons.forEach((button) => button.addEventListener('click', () => setTab(button.dataset.tab)));
elements.hamburgerButton.addEventListener('click', toggleHamburgerPanel);
elements.closeHamburgerButton.addEventListener('click', closeHamburgerPanel);
elements.saveConstraintsButton.addEventListener('click', saveConstraints);
elements.goDashboardTopButton.addEventListener('click', () => setTab('dashboard'));
elements.toggleChangerPanelButton.addEventListener('click', toggleChangerPanel);
elements.zoomOutButton.addEventListener('click', () => {
	setZoom(state.zoom - 0.25);
	markDirty();
});
elements.zoomInButton.addEventListener('click', () => {
	setZoom(state.zoom + 0.25);
	markDirty();
});
elements.resetZoomButton.addEventListener('click', () => {
	setZoom(1);
	markDirty();
});
elements.deleteClassButton.addEventListener('click', deleteActiveClass);
elements.saveGalleryButton.addEventListener('click', savePendingPhoto);
elements.discardGalleryButton.addEventListener('click', closeCapturePrompt);
elements.viewerZoomOutButton.addEventListener('click', () => setPhotoZoom(state.photoZoom - 0.25));
elements.viewerZoomInButton.addEventListener('click', () => setPhotoZoom(state.photoZoom + 0.25));
elements.viewerZoomResetButton.addEventListener('click', () => setPhotoZoom(1));
elements.closeViewerButton.addEventListener('click', closeGalleryViewer);
elements.viewerPhoto.addEventListener('wheel', (event) => {
	if (!event.ctrlKey) {
		return;
	}

	event.preventDefault();
	setPhotoZoom(state.photoZoom + (event.deltaY < 0 ? 0.25 : -0.25));
}, { passive: false });
elements.viewerOverlay.addEventListener('click', (event) => {
	if (event.target === elements.viewerOverlay) {
		closeGalleryViewer();
	}
});
elements.captureOverlay.addEventListener('click', (event) => {
	if (event.target === elements.captureOverlay) {
		closeCapturePrompt();
	}
});
elements.quickAddClassButton.addEventListener('click', () => addClass(elements.quickClassName.value));
elements.quickApplyStudentsButton.addEventListener('click', () => applyStudents(elements.quickStudentInput.value));
elements.goChangerButton.addEventListener('click', () => setTab('changer'));
elements.studentClassSelect.addEventListener('change', () => selectClass(elements.studentClassSelect.value));
elements.changerClassSelect.addEventListener('change', () => selectClass(elements.changerClassSelect.value));
elements.shuffleButton.addEventListener('click', shuffleSeats);
elements.saveButton.addEventListener('click', save);
elements.loadButton.addEventListener('click', load);
elements.addSeatButton.addEventListener('click', addSeat);
elements.deleteSeatButton.addEventListener('click', deleteSelectedSeat);
elements.seatCanvas.addEventListener('pointerdown', startDrag);
elements.seatCanvas.addEventListener('pointermove', moveDrag);
elements.seatCanvas.addEventListener('pointerup', endDrag);
elements.seatCanvas.addEventListener('pointercancel', endDrag);
elements.seatCanvas.addEventListener('contextmenu', (event) => event.preventDefault());

await loadPermanentData();
renderAll();
setZoom(state.zoom);
setTab('dashboard');
