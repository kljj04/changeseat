export const GRID_SIZE = 20;
export const SEAT_WIDTH = 80;
export const SEAT_HEIGHT = 40;

export function parseStudents(rawText) {
	return rawText
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

export function shuffle(list) {
	const result = [...list];

	for (let index = result.length - 1; index > 0; index -= 1) {
		const target = Math.floor(Math.random() * (index + 1));
		[result[index], result[target]] = [result[target], result[index]];
	}

	return result;
}

export function makeSeatPlan(students, rows, cols) {
	const total = rows * cols;
	const shuffled = shuffle(students.map((name, index) => ({
		name,
		studentNumber: index + 1,
	}))).slice(0, total);
	const seats = [];

	while (shuffled.length < total) {
		shuffled.push({ name: '', studentNumber: null });
	}

	for (let index = 0; index < total; index += 1) {
		seats.push(createSeat(index, shuffled[index].name, cols, shuffled[index].studentNumber));
	}

	return seats;
}

export function createSeat(index, name, cols, studentNumber = null) {
	const col = index % cols;
	const row = Math.floor(index / cols);

	return {
		id: `seat-${index + 1}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
		name,
		studentNumber,
		x: snap(40 + col * 100),
		y: snap(70 + row * 60),
		fixed: false,
	};
}

export function makeEmptySeatLayout(rows, cols, existingSeats = []) {
	const total = rows * cols;
	const seats = existingSeats.slice(0, total).map((seat, index) => normalizeSeat(seat, index, cols));

	while (seats.length < total) {
		seats.push(createSeat(seats.length, '', cols));
	}

	return seats;
}

export function relayoutSeats(students, rows, cols) {
	const total = rows * cols;
	const names = students.slice(0, total);

	while (names.length < total) {
		names.push('');
	}

	return names.map((name, index) => createSeat(index, name, cols));
}

export function normalizeSeat(value, index, cols) {
	if (typeof value === 'string') {
		return createSeat(index, value, cols);
	}

	const fallback = createSeat(index, '', cols);

	return {
		id: value?.id || fallback.id,
		name: String(value?.name || ''),
		studentNumber: value?.studentNumber ?? null,
		x: snap(Number.isFinite(Number(value?.x)) ? Number(value.x) : fallback.x),
		y: snap(Number.isFinite(Number(value?.y)) ? Number(value.y) : fallback.y),
		fixed: Boolean(value?.fixed),
	};
}

export function snap(value) {
	return Math.round(Number(value || 0) / GRID_SIZE) * GRID_SIZE;
}
