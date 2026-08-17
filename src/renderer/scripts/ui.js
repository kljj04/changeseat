import { SEAT_HEIGHT, SEAT_WIDTH } from './seats.js';

export function renderSeats(canvas, seats, selectedIndex = -1) {
	const existing = new Map(
		[...canvas.querySelectorAll('.seat')].map((element) => [element.dataset.id, element]),
	);
	const used = new Set();

	for (let index = 0; index < seats.length; index += 1) {
		const item = seats[index];
		const seat = existing.get(item.id) || document.createElement('button');
		const name = item.name || '';
		const seatNumber = item.studentNumber ?? index + 1;

		seat.className = `seat ${name ? 'filled' : 'empty'}${item.fixed ? ' fixed' : ''}${index === selectedIndex ? ' selected' : ''}`;
		seat.type = 'button';
		seat.dataset.id = item.id;
		seat.dataset.index = String(index);
		seat.style.left = `${item.x}px`;
		seat.style.top = `${item.y}px`;
		seat.style.width = `${SEAT_WIDTH}px`;
		seat.style.height = `${SEAT_HEIGHT}px`;
		seat.style.transform = '';

		const content = `
			<div class="seat-body"></div>
			<div class="seat-content">
				<span class="seat-number">${seatNumber || ''}</span>
				<span class="seat-divider">|</span>
				<strong class="seat-name">${escapeHtml(name)}</strong>
			</div>
			<span class="seat-lock" title="${item.fixed ? '고정 해제' : '좌석 고정'}"></span>
		`;

		if (seat.innerHTML !== content) {
			seat.innerHTML = content;
		}

		used.add(item.id);
		canvas.appendChild(seat);
	}

	for (const [id, element] of existing) {
		if (!used.has(id)) {
			element.remove();
		}
	}
}

export function updateSeatElement(element, seat) {
	element.style.left = `${seat.x}px`;
	element.style.top = `${seat.y}px`;
}

export function setMessage(element, message, type = 'normal') {
	element.textContent = message;
	element.dataset.type = type;
}

export function renderPhotoPreview(container, photo, options = {}) {
	container.replaceChildren();
	const scale = Math.max(0.5, Math.min(4, Number(options.scale || 1)));

	if (photo.imageData && (!Array.isArray(photo.seats) || photo.seats.length === 0)) {
		const image = document.createElement('img');
		image.className = 'photo-screenshot';
		image.src = photo.imageData;
		image.alt = `${photo.className} seat capture`;
		container.appendChild(image);
		return;
	}

	const header = document.createElement('div');
	header.className = 'photo-header';
	header.innerHTML = `<span>SeatChanger</span><strong>${escapeHtml(photo.className)} / ${formatDate(photo.createdAt)}</strong>`;
	container.appendChild(header);

	const board = document.createElement('div');
	board.className = 'photo-board';
	container.appendChild(board);
	const bounds = seatBounds(photo.seats);
	const boardWidth = Math.max(640, Number(photo.boardWidth || 0), bounds.maxX + 80);
	const boardHeight = Math.max(420, Number(photo.boardHeight || 0), bounds.maxY + 80);
	const surface = document.createElement('div');
	surface.className = 'photo-board-surface';
	surface.style.width = `${boardWidth * scale}px`;
	surface.style.height = `${boardHeight * scale}px`;
	surface.style.backgroundSize = `${20 * scale}px ${20 * scale}px`;
	surface.innerHTML = '<div class="photo-front">앞</div>';
	const front = surface.querySelector('.photo-front');
	front.style.height = `${26 * scale}px`;
	front.style.lineHeight = `${26 * scale}px`;
	front.style.fontSize = `${10 * scale}px`;
	board.appendChild(surface);

	for (let index = 0; index < photo.seats.length; index += 1) {
		const item = photo.seats[index];
		const seat = document.createElement('div');
		seat.className = `photo-seat${item.fixed ? ' fixed' : ''}`;
		seat.style.left = `${Number(item.x || 0) * scale}px`;
		seat.style.top = `${Number(item.y || 0) * scale}px`;
		seat.style.width = `${SEAT_WIDTH * scale}px`;
		seat.style.height = `${SEAT_HEIGHT * scale}px`;
		seat.style.fontSize = `${13 * scale}px`;
		seat.innerHTML = `
			<div class="photo-seat-body"></div>
			<div class="photo-seat-content">
				<span>${item.studentNumber ?? index + 1}</span>
				<i>|</i>
				<strong>${escapeHtml(item.name || '')}</strong>
			</div>
		`;
		surface.appendChild(seat);
	}
}

export function renderGallery(board, gallery, actions = {}) {
	board.replaceChildren();

	if (gallery.length === 0) {
		const empty = document.createElement('p');
		empty.className = 'muted';
		empty.textContent = '저장된 사진 없음.';
		board.appendChild(empty);
		return;
	}

	for (const photo of gallery) {
		const pin = document.createElement('article');
		pin.className = 'gallery-pin';
		const photoBox = document.createElement('button');
		photoBox.className = 'gallery-photo-button';
		photoBox.type = 'button';
		photoBox.addEventListener('click', () => actions.onOpen?.(photo.id));
		renderPhotoPreview(photoBox, photo);
		const toolbar = document.createElement('div');
		toolbar.className = 'gallery-actions';
		toolbar.innerHTML = `
			<button data-action="load" type="button">불러오기</button>
			<button data-action="delete" type="button">삭제</button>
		`;
		toolbar.querySelector('[data-action="load"]').addEventListener('click', () => actions.onLoad?.(photo.id));
		toolbar.querySelector('[data-action="delete"]').addEventListener('click', () => actions.onDelete?.(photo.id));
		pin.appendChild(photoBox);
		pin.appendChild(toolbar);
		board.appendChild(pin);
	}
}

export function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(value) {
	const date = new Date(value);

	if (Number.isNaN(date.getTime())) {
		return '';
	}

	return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function seatBounds(seats) {
	if (!Array.isArray(seats) || seats.length === 0) {
		return {
			minX: 0,
			minY: 0,
			maxX: 1,
			maxY: 1,
			width: 1,
			height: 1,
		};
	}

	const xs = seats.map((seat) => Number(seat.x || 0));
	const ys = seats.map((seat) => Number(seat.y || 0));
	const minX = Math.min(...xs);
	const minY = Math.min(...ys);
	const maxX = Math.max(...xs) + SEAT_WIDTH;
	const maxY = Math.max(...ys) + SEAT_HEIGHT;

	return {
		minX,
		minY,
		maxX,
		maxY,
		width: maxX - minX,
		height: maxY - minY,
	};
}

function escapeHtml(value) {
	return String(value || '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}
