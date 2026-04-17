/**
 * @file useBarcodeCamera.js
 * @description Abre câmera e lê códigos de barras/QR em tempo real via ZXing.
 *              ZXing é carregado dinamicamente (CDN) apenas quando necessário.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const ZXING_CDN = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/es2015/index.min.js';

async function loadZXing() {
  if (window.__ZXingBrowser) return window.__ZXingBrowser;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.type = 'module';
    s.src = ZXING_CDN;
    s.onload = () => {
      // ZXing carregado como ES module via CDN — acessa via import()
      resolve(null);
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export function useBarcodeCamera({ onScan, onError }) {
  const [active,   setActive]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [cameras,  setCameras]  = useState([]);
  const [camIdx,   setCamIdx]   = useState(0);
  const videoRef   = useRef(null);
  const readerRef  = useRef(null);
  const streamRef  = useRef(null);

  const stop = useCallback(() => {
    try { readerRef.current?.reset(); } catch {}
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    readerRef.current = null;
    streamRef.current = null;
    setActive(false);
  }, []);

  const start = useCallback(async (deviceId) => {
    setLoading(true);
    try {
      // Importa ZXing dinamicamente
      const ZXing = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/esm/index.js')
        .catch(() => import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.4/esm/index.js'));

      const hints = new Map();
      // Suporta todos os formatos comuns
      const { BarcodeFormat, DecodeHintType } = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.2/esm/index.js');
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39, BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new ZXing.BrowserMultiFormatReader(hints);
      readerRef.current = reader;

      // Lista câmeras na primeira chamada
      if (cameras.length === 0) {
        const devs = await ZXing.BrowserMultiFormatReader.listVideoInputDevices();
        setCameras(devs);
        // Prefere câmera traseira no celular
        const back = devs.findIndex(d => /back|rear|environment/i.test(d.label));
        if (back >= 0) setCamIdx(back);
      }

      const constraints = deviceId
        ? { video: { deviceId: { exact: deviceId } } }
        : { video: { facingMode: 'environment' } };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      await reader.decodeFromStream(stream, videoRef.current, (result, err) => {
        if (result) onScan?.(result.getText());
        // Ignora erros de frame sem código
      });

      setActive(true);
    } catch(e) {
      onError?.(e.message || 'Câmera não disponível');
      stop();
    } finally {
      setLoading(false);
    }
  }, [cameras, onScan, onError, stop]);

  useEffect(() => () => stop(), [stop]);

  return { active, loading, cameras, camIdx, setCamIdx, videoRef, start, stop };
}
