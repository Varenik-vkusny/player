// Общая сцена для обоих хостов. Тот же файл читают и плеер, и редактор —
// иначе сравнивались бы не рендеры, а два описания сцены.

export const SCENE = {
  width: 1920,
  height: 1080,
  background: '#11141a',
  elements: [
    {
      id: 'title', type: 'text', x: 120, y: 120, width: 1100, height: 140, zIndex: 3,
      content: 'Аудио — единственный источник времени',
      style: {
        color: '#f5f7fa', 'font-family': 'Georgia, serif', 'font-size': '64px',
        'line-height': '1.15', 'font-weight': '700',
      },
    },
    {
      id: 'lead', type: 'text', x: 120, y: 300, width: 900, height: 220, zIndex: 3,
      content: 'Таймлайн ведомый: он создаётся в паузе и никогда не играет сам. '
             + 'Каждый кадр мы выставляем ему время, посчитанное от аудио.',
      style: {
        color: '#9fb0c4', 'font-family': 'system-ui, sans-serif', 'font-size': '32px',
        'line-height': '1.5',
      },
    },
    {
      id: 'card', type: 'shape', x: 1180, y: 260, width: 560, height: 360, zIndex: 1,
      style: { background: '#1b2430', 'border-radius': '28px', border: '2px solid #2c3a4d' },
    },
    {
      id: 'accent', type: 'shape', x: 1240, y: 320, width: 200, height: 200, zIndex: 2,
      rotation: 12,
      style: { background: '#e4572e', 'border-radius': '32px' },
    },
    {
      id: 'dot', type: 'shape', x: 1500, y: 400, width: 120, height: 120, zIndex: 2,
      style: { background: '#f3a712', 'border-radius': '50%' },
    },
    {
      id: 'bar', type: 'shape', x: 120, y: 820, width: 1680, height: 12, zIndex: 1,
      style: { background: '#2c3a4d', 'border-radius': '6px' },
    },
    {
      id: 'gate', type: 'shape', x: 900, y: 806, width: 8, height: 40, zIndex: 4,
      style: { background: '#a8c686', 'border-radius': '4px' },
    },
    {
      id: 'caption', type: 'text', x: 120, y: 880, width: 1200, height: 60, zIndex: 3,
      content: 'Гейт останавливает всё сразу. Возобновление — с той же позиции.',
      style: {
        color: '#6d7f95', 'font-family': 'system-ui, sans-serif', 'font-size': '26px',
      },
    },
  ],
};
