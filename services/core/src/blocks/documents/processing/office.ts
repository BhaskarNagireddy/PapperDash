import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const TIMEOUT_MS = 90_000;

/**
 * Converts a Word, Excel or PowerPoint file to PDF with headless LibreOffice.
 * Each conversion gets its own temporary directory and LibreOffice profile, so conversions can run in
 * parallel and nothing survives between files. Macros are never executed in headless conversion.
 */
export async function officeToPdf(buf: Buffer, ext: 'docx' | 'xlsx' | 'pptx', binary = process.env.SOFFICE_PATH ?? 'soffice'): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'pd-convert-'));
  try {
    const input = join(dir, `input.${ext}`);
    await writeFile(input, buf);
    await new Promise<void>((resolve, reject) => {
      execFile(
        binary,
        ['--headless', '--norestore', '--nolockcheck', `-env:UserInstallation=${pathToFileURL(join(dir, 'profile')).href}`, '--convert-to', 'pdf', '--outdir', dir, input],
        { timeout: TIMEOUT_MS, killSignal: 'SIGKILL' },
        (err) => (err ? reject(err) : resolve()),
      );
    });
    return await readFile(join(dir, 'input.pdf'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
