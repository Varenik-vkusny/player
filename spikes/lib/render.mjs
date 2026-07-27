// ЕДИНСТВЕННАЯ функция рендера сцены (черновик для спайка S7).
//
// Инвариант №5: редактор импортирует рендер из плеера. Здесь это выражено
// конструктивно — модуль не знает ни про React, ни про ванильный хост, ни про
// аудио. Он умеет одно: по описанию сцены построить DOM.
//
// Инвариант №6: никаких импортов «наверх». Только стандартный DOM.
//
// Масштабирование (docs/research/scene-scaling.md): логический размер сцены
// фиксирован, контейнер получает transform: translate() scale(). Раскладка
// считается ОДИН раз в логических пикселях, поэтому переносы строк физически
// не могут разойтись между экранами.

export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

/** Вычисляет масштаб и отступы для вписывания сцены в контейнер (letterbox). */
export function fitStage(hostWidth, hostHeight, width = STAGE_WIDTH, height = STAGE_HEIGHT) {
  if (hostWidth <= 0 || hostHeight <= 0) {
    throw new Error(`Некорректный размер хоста: ${hostWidth}x${hostHeight}`);
  }
  const scale = Math.min(hostWidth / width, hostHeight / height);
  return {
    scale,
    offsetX: (hostWidth - width * scale) / 2,
    offsetY: (hostHeight - height * scale) / 2,
  };
}

function applyElement(node, element) {
  node.className = `scene-el scene-${element.type}`;
  node.dataset.id = element.id;

  const style = node.style;
  style.position = 'absolute';
  style.left = `${element.x}px`;
  style.top = `${element.y}px`;
  style.width = `${element.width}px`;
  style.height = `${element.height}px`;
  style.zIndex = String(element.zIndex ?? 0);
  // Инвариант №8: смещение и поворот только через transform.
  style.transform = element.rotation ? `rotate(${element.rotation}deg)` : '';
  style.margin = '0';
  style.boxSizing = 'border-box';

  for (const [key, value] of Object.entries(element.style ?? {})) {
    style.setProperty(key, String(value));
  }

  if (element.type === 'text') {
    node.textContent = element.content ?? '';
  } else if (element.type === 'shape') {
    node.textContent = '';
  } else if (element.type === 'image') {
    node.textContent = '';
    style.backgroundImage = element.content ? `url(${element.content})` : '';
    style.backgroundSize = 'cover';
  } else {
    throw new Error(`Неизвестный тип элемента: ${element.type}`);
  }
}

/**
 * Строит сцену внутри контейнера. Возвращает карту id -> узел, чтобы
 * анимации могли адресовать элементы, не разыскивая их по DOM.
 *
 * Контейнер приводится к известному состоянию целиком: рендер обязан быть
 * функцией от сцены, а не от истории вызовов.
 */
export function renderScene(host, scene) {
  if (!host) throw new Error('renderScene: не передан контейнер');
  if (!scene || !Array.isArray(scene.elements)) {
    throw new Error('renderScene: сцена без массива elements');
  }

  host.textContent = '';
  host.style.position = 'relative';
  host.style.width = `${scene.width ?? STAGE_WIDTH}px`;
  host.style.height = `${scene.height ?? STAGE_HEIGHT}px`;
  host.style.transformOrigin = '0 0';
  host.style.overflow = 'hidden';
  if (scene.background) host.style.background = scene.background;

  const nodes = new Map();
  // Порядок вставки фиксирован порядком в массиве: рендер детерминирован,
  // и одинаковая сцена всегда даёт одинаковый DOM.
  for (const element of scene.elements) {
    const node = document.createElement('div');
    applyElement(node, element);
    host.appendChild(node);
    nodes.set(element.id, node);
  }
  return nodes;
}

/** Вписывает уже отрисованную сцену в размеры хоста. */
export function applyFit(host, hostWidth, hostHeight, scene = {}) {
  const { scale, offsetX, offsetY } = fitStage(
    hostWidth, hostHeight, scene.width ?? STAGE_WIDTH, scene.height ?? STAGE_HEIGHT
  );
  // will-change здесь НЕ ставим: он фиксирует растр и даёт мыло при масштабе.
  host.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  return scale;
}
