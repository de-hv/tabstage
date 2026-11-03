export default defineBackground(() => {
  console.log('Tabstage background started', { id: browser.runtime.id });
});
