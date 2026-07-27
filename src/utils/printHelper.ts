export function printDocumentInPage(htmlContent: string) {
  // Remove any previously existing print iframe
  const existingFrame = document.getElementById('system-print-frame');
  if (existingFrame) {
    existingFrame.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'system-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0px';
  iframe.style.height = '0px';
  iframe.style.border = '0px';
  iframe.style.zIndex = '-9999';

  document.body.appendChild(iframe);

  const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!frameDoc) return;

  frameDoc.open();
  frameDoc.write(htmlContent);
  frameDoc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error('Print error:', e);
    }
    setTimeout(() => {
      try {
        iframe.remove();
      } catch (e) {}
    }, 2000);
  }, 300);
}
