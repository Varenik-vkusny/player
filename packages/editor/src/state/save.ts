/**
 * Сохранение проекта.
 *
 * Про React не знает и знать не должен: это правило продукта, а не свойство
 * интерфейса. Компонент только зовёт.
 */
import { loadProject, type Project } from '@player/core';

/** Ключ, по которому редактор передаёт проект плееру для предпросмотра. */
export const PREVIEW_KEY = 'player:preview-project';

/**
 * Превращает проект в текст файла.
 *
 * Перед выдачей результат прогоняется через loadProject. Это не паранойя:
 * редактор правит проект десятками мелких действий, и единственный момент,
 * когда ошибку ещё можно связать с тем, что автор сделал, — прямо сейчас.
 * Найденная при следующем открытии, она будет выглядеть как испорченный файл
 * без причины.
 *
 * Отступ в два пробела: файл читают и сравнивают глазами, а однострочный
 * JSON в двадцать тысяч символов сравнить нельзя.
 */
export function serializeProject(project: Project): string {
  const text = JSON.stringify(project, null, 2);
  // Разбор обратно, а не проверка исходного объекта: сериализация умеет
  // терять — undefined, NaN, циклы. Проверять надо то, что действительно
  // окажется в файле.
  loadProject(JSON.parse(text));
  return text;
}

/**
 * Отдаёт проект файлом.
 *
 * Ссылка живёт ровно до клика: у объектных URL нет сборщика мусора,
 * и незакрытый URL держит копию файла в памяти вкладки до её закрытия.
 */
export function downloadProject(project: Project, fileName = 'project.json'): void {
  const text = serializeProject(project);
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Кладёт проект туда, откуда его возьмёт плеер, и открывает предпросмотр.
 *
 * Через хранилище, а не через адресную строку: проект с настоящей озвучкой —
 * это двадцать тысяч символов, и в URL он не помещается. Бэкенда в этой
 * сессии нет по условию задачи.
 *
 * Именно localStorage, а не sessionStorage. У новой вкладки собственное
 * sessionStorage; оно копируется от открывающей страницы только если окно
 * открыто БЕЗ noopener. Полагаться на это значило бы обменять работающий
 * предпросмотр на связь между вкладками, которая нам не нужна.
 */
export function openInPlayer(project: Project, url = '/?from=editor'): void {
  localStorage.setItem(PREVIEW_KEY, serializeProject(project));
  window.open(url, '_blank', 'noopener');
}
