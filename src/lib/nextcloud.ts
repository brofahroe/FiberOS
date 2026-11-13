const NEXTCLOUD_URL = (process.env.NEXTCLOUD_URL || 'https://drive.gciconnect.my.id').replace(/\/$/, '');
const NEXTCLOUD_USER = process.env.NEXTCLOUD_USER || 'gcibot';
const NEXTCLOUD_PASSWORD = process.env.NEXTCLOUD_PASSWORD || 'Gcidesign#1';
const NEXTCLOUD_DIR = (process.env.NEXTCLOUD_DIR || 'foto-imple').replace(/^\/|\/$/g, '');

const authHeader = `Basic ${Buffer.from(`${NEXTCLOUD_USER}:${NEXTCLOUD_PASSWORD}`).toString('base64')}`;

// Base WebDAV files URL: https://drive.gciconnect.my.id/remote.php/dav/files/gcibot/
const davBaseUrl = `${NEXTCLOUD_URL}/remote.php/dav/files/${encodeURIComponent(NEXTCLOUD_USER)}`;

/**
 * Ensures a directory exists in Nextcloud WebDAV
 */
export async function ensureNextcloudDir(dirPath: string): Promise<boolean> {
  const cleanPath = dirPath.replace(/^\/|\/$/g, '');
  if (!cleanPath) return true;

  const parts = cleanPath.split('/');
  let current = '';

  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const url = `${davBaseUrl}/${encodeURI(current)}/`;

    try {
      // Check with PROPFIND
      const checkRes = await fetch(url, {
        method: 'PROPFIND',
        headers: {
          Authorization: authHeader,
          Depth: '0',
        },
      });

      if (checkRes.status === 404) {
        // Create directory with MKCOL
        const mkRes = await fetch(url, {
          method: 'MKCOL',
          headers: {
            Authorization: authHeader,
          },
        });
        if (mkRes.status !== 201 && mkRes.status !== 200 && mkRes.status !== 405) {
          console.warn(`Nextcloud MKCOL status for ${current}:`, mkRes.status);
        }
      }
    } catch (err) {
      console.error(`Nextcloud error ensuring dir ${current}:`, err);
      return false;
    }
  }

  return true;
}

/**
 * Uploads a file Buffer to Nextcloud WebDAV
 */
export async function uploadFileToNextcloud({
  buffer,
  fileName,
  subFolder,
  contentType = 'image/jpeg',
}: {
  buffer: Buffer;
  fileName: string;
  subFolder?: string;
  contentType?: string;
}): Promise<{ success: boolean; url: string; remotePath: string; error?: string }> {
  try {
    const targetDir = subFolder ? `${NEXTCLOUD_DIR}/${subFolder}` : NEXTCLOUD_DIR;
    await ensureNextcloudDir(targetDir);

    const remotePath = `${targetDir}/${fileName}`;
    const targetUrl = `${davBaseUrl}/${encodeURI(remotePath)}`;

    const res = await fetch(targetUrl, {
      method: 'PUT',
      headers: {
        Authorization: authHeader,
        'Content-Type': contentType,
      },
      body: new Uint8Array(buffer),
    });

    if (res.status === 201 || res.status === 204 || res.status === 200) {
      // Return the proxy URL that serves the image within FiberOS
      const proxyUrl = `/api/photos/${remotePath}`;
      return {
        success: true,
        url: proxyUrl,
        remotePath,
      };
    } else {
      const errText = await res.text().catch(() => '');
      return {
        success: false,
        url: '',
        remotePath: '',
        error: `Nextcloud upload failed with status ${res.status}: ${errText.slice(0, 200)}`,
      };
    }
  } catch (error: any) {
    console.error('uploadFileToNextcloud error:', error);
    return {
      success: false,
      url: '',
      remotePath: '',
      error: error.message || 'Gagal mengunggah file ke Nextcloud',
    };
  }
}

/**
 * Downloads or streams a file from Nextcloud WebDAV
 */
export async function getFileFromNextcloud(remotePath: string): Promise<Response | null> {
  try {
    const cleanPath = remotePath.replace(/^\/|\/$/g, '');
    const targetUrl = `${davBaseUrl}/${encodeURI(cleanPath)}`;

    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
      },
    });

    if (res.status === 200) {
      return res;
    }
    return null;
  } catch (err) {
    console.error('getFileFromNextcloud error:', err);
    return null;
  }
}

/**
 * Deletes a file from Nextcloud WebDAV
 */
export async function deleteFileFromNextcloud(remotePath: string): Promise<boolean> {
  try {
    const cleanPath = remotePath.replace(/^\/|\/$/g, '');
    const targetUrl = `${davBaseUrl}/${encodeURI(cleanPath)}`;

    const res = await fetch(targetUrl, {
      method: 'DELETE',
      headers: {
        Authorization: authHeader,
      },
    });

    return res.status === 204 || res.status === 200;
  } catch (err) {
    console.error('deleteFileFromNextcloud error:', err);
    return false;
  }
}

