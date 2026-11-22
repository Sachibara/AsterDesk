(() => {
  const field = id => document.getElementById(id);
  const button = field('workerExport'), status = field('workerStatus');
  button.onclick = async () => {
    button.disabled = true;
    try {
      const file = field('huntCV').files[0];
      if (!file || file.size > 10000000) throw Error('Select a CV of up to 10 MB.');
      const drive = new URL(field('workerDrive').value);
      const id = drive.pathname.match(/^\/file\/d\/([\w-]+)/)?.[1] || drive.searchParams.get('id');
      if (drive.origin !== 'https://drive.google.com' || !/^[\w-]{10,}$/.test(id || '')) throw Error('Use the private Drive link to the original CV.');
      const url = new URL(field('huntURL').value);
      if (url.protocol !== 'https:' || url.username || url.password) throw Error('Use a public HTTPS portfolio.');
      const cv = (await extractDocument(file)).trim();
      if (!cv || cv.length > 100000) throw Error('Choose a readable CV under 100,000 characters.');
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), b => b.toString(16).padStart(2,'0')).join('');
      const response = await fetch('/autopilot-template.txt');
      if (!response.ok) throw Error('Setup file unavailable. Try again.');
      const template = await response.text();
      if (!template.includes('__ASTER_PROFILE__')) throw Error('Invalid setup file.');
      const profile = {cv,hash,fileName:file.name,fileId:id,portfolio:url.href,includePH:field('huntRegion').value !== 'world'};
      const script = template.replace('__ASTER_PROFILE__', () => JSON.stringify(profile));
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([script], {type:'text/plain'}));
      link.download = 'Aster-private-setup.txt';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 30000);
      status.textContent = 'Downloaded. Complete the Google authorization below to start automatic applications.';
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  };
})();
