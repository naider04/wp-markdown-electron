/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UploadedFile } from '../types';

const DB_NAME = 'wp_editor_db';
const STORE_NAME = 'uploaded_files';
const DB_VERSION = 1;

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function getAllUploadedFiles(): Promise<UploadedFile[]> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('Error getting files from IndexedDB:', err);
    return [];
  }
}

export async function saveUploadedFilesToDB(files: UploadedFile[]): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      // Clear the store and rewrite to ensure the DB matches the in-memory array perfectly
      const clearRequest = store.clear();

      clearRequest.onsuccess = () => {
        if (files.length === 0) {
          resolve();
          return;
        }

        let completed = 0;
        let hasError = false;

        files.forEach((file) => {
          const addRequest = store.add(file);
          addRequest.onsuccess = () => {
            completed++;
            if (completed === files.length && !hasError) {
              resolve();
            }
          };
          addRequest.onerror = () => {
            if (!hasError) {
              hasError = true;
              reject(addRequest.error);
            }
          };
        });
      };

      clearRequest.onerror = () => {
        reject(clearRequest.error);
      };
    });
  } catch (err) {
    console.error('Error saving files to IndexedDB:', err);
  }
}

export async function clearAllUploadedFilesDB(): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('Error clearing IndexedDB:', err);
  }
}
