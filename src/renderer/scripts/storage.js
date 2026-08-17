import { makeEmptySeatLayout, normalizeSeat, normalizeStudent } from './seats.js';

export function snapshotState({
	classes,
	currentClassId,
	gallery = [],
	zoom = 1,
	flashAfterShuffle = false,
	autoSaveGallery = false,
}) {
	return {
		version: 6,
		savedAt: new Date().toISOString(),
		currentClassId,
		classes,
		gallery,
		zoom,
		settings: {
			flashAfterShuffle: Boolean(flashAfterShuffle),
			autoSaveGallery: Boolean(autoSaveGallery),
		},
	};
}

export function normalizeLoadedState(data) {
	if (!data) {
		throw new Error('자리표 파일 형식이 아님.');
	}

	if (Array.isArray(data.classes)) {
		const classes = data.classes.map((classroom, index) => normalizeClassroom(classroom, index));
		return {
			classes,
			currentClassId: data.currentClassId || classes[0]?.id || null,
			gallery: normalizeGallery(data.gallery),
			zoom: Number(data.zoom || 1),
			settings: normalizeSettings(data.settings),
		};
	}

	if (Array.isArray(data.students)) {
		const legacy = normalizeClassroom({
			id: 'legacy-class',
			name: '불러온 반',
			students: data.students,
			rows: Number(data.rows || 5),
			cols: Number(data.cols || 6),
			seats: data.seats,
		}, 0);

		return {
			classes: [legacy],
			currentClassId: legacy.id,
			gallery: [],
			zoom: 1,
			settings: normalizeSettings(),
		};
	}

	throw new Error('자리표 파일 형식이 아님.');
}

function normalizeSettings(value) {
	return {
		flashAfterShuffle: Boolean(value?.flashAfterShuffle),
		autoSaveGallery: Boolean(value?.autoSaveGallery || value?.captureAfterShuffle),
	};
}

function normalizeGallery(value) {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.map((item, index) => ({
		id: item?.id || `gallery-${Date.now()}-${index}`,
		className: String(item?.className || '반 없음'),
		createdAt: item?.createdAt || new Date().toISOString(),
		students: normalizeStudents(item?.students),
		rows: Number(item?.rows || 5),
		cols: Number(item?.cols || 6),
		zoom: Number(item?.zoom || 1),
		imageData: typeof item?.imageData === 'string' ? item.imageData : null,
		imageWidth: Number(item?.imageWidth || 0) || null,
		imageHeight: Number(item?.imageHeight || 0) || null,
		boardWidth: Number(item?.boardWidth || 0) || null,
		boardHeight: Number(item?.boardHeight || 0) || null,
		seats: Array.isArray(item?.seats) ? item.seats.map((seat) => ({ ...seat })) : [],
	}));
}

export function normalizeClassroom(classroom, index = 0) {
	const rows = Number(classroom?.rows || 5);
	const cols = Number(classroom?.cols || 6);
	const students = normalizeStudents(classroom?.students);

	return {
		id: classroom?.id || `class-${Date.now()}-${index}`,
		name: String(classroom?.name || `반 ${index + 1}`),
		students,
		rows,
		cols,
		seats: normalizeLoadedSeats(classroom, rows, cols),
		constraints: normalizeConstraints(classroom?.constraints),
	};
}

function normalizeStudents(value) {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.map((student, index) => normalizeStudent(student, index))
		.filter((student) => student.name);
}

function normalizeConstraints(value) {
	return {
		avoidPairs: String(value?.avoidPairs || ''),
		preferPairs: String(value?.preferPairs || ''),
		radiusAvoidPairs: String(value?.radiusAvoidPairs || ''),
		genderPairMode: ['same', 'mixed'].includes(value?.genderPairMode) ? value.genderPairMode : 'none',
	};
}

function normalizeLoadedSeats(data, rows, cols) {
	if (!Array.isArray(data?.seats)) {
		return makeEmptySeatLayout(rows, cols);
	}

	return data.seats.map((seat, index) => normalizeSeat(seat, index, cols));
}
