import React, { useEffect, useRef, useState, useCallback } from "react";
import { IconCamera, IconMicrophone, IconStop, IconUpload } from "../icons/Icons";

/**
 * SecurityRecorder - Componente de grabación de seguridad
 * 
 * Graba video y audio cuando el usuario accede al área segura.
 * Las grabaciones se envían al servidor como evidencia forense.
 * 
 * En modo silent: graba sin mostrar interfaz visible
 */
export function SecurityRecorder({ 
  isActive, 
  onRecordingStart, 
  onRecordingEnd,
  onRecordingUploaded,
  maxDurationMs = 120000, // 2 minutos por defecto
  silent = true // Modo silencioso - no muestra interfaz
}) {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startTimeRef = useRef(null);
  const isStartingRef = useRef(false);
  
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState(null);
  const [error, setError] = useState(null);
  const [remainingTime, setRemainingTime] = useState(maxDurationMs / 1000);
  const [uploadStatus, setUploadStatus] = useState(null);

  // Función para obtener cookie decodificada
  const getCookie = (name) => {
    const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return m ? decodeURIComponent(m[2]) : null;
  };

  // Función para subir la grabación
  const uploadRecording = useCallback(async (data) => {
    const csrfToken = getCookie('sfas_csrf');
    console.log('[SecurityRecorder] CSRF Token:', csrfToken ? 'present' : 'missing');
    console.log('[SecurityRecorder] Session cookie:', getCookie('sfas_session') ? 'present' : 'missing');

    const response = await fetch('/api/recordings/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken || ''
      },
      credentials: 'include',
      body: JSON.stringify(data)
    });

    console.log('[SecurityRecorder] Upload response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SecurityRecorder] Upload failed:', errorText);
      throw new Error(`Failed to upload recording: ${errorText}`);
    }

    return response.json();
  }, []);

  // Función para detener el stream
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Función para detener la grabación
  const stopRecording = useCallback(() => {
    console.log('[SecurityRecorder] stopRecording called, state:', mediaRecorderRef.current?.state);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  // Función para iniciar la grabación
  const startRecording = useCallback(async () => {
    // Evitar múltiples inicios
    if (isStartingRef.current || isRecording) {
      console.log('[SecurityRecorder] Already starting or recording, skipping');
      return;
    }
    
    isStartingRef.current = true;
    console.log('[SecurityRecorder] Starting recording...');
    
    try {
      setError(null);
      setUploadStatus(null);
      chunksRef.current = [];
      
      // Solicitar acceso a cámara y micrófono
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user"
        },
        audio: true
      });
      
      console.log('[SecurityRecorder] Got media stream');
      streamRef.current = stream;
      setHasPermission(true);
      
      // Asignar stream al video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      // Determinar el mejor formato soportado
      let mimeType = 'video/webm';
      const formats = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264',
        'video/webm',
        'video/mp4'
      ];
      
      for (const format of formats) {
        if (MediaRecorder.isTypeSupported(format)) {
          mimeType = format;
          break;
        }
      }
      
      console.log('[SecurityRecorder] Using mime type:', mimeType);
      
      const mediaRecorder = new MediaRecorder(stream, { 
        mimeType,
        videoBitsPerSecond: 1000000 // 1 Mbps
      });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        console.log('[SecurityRecorder] Data available, size:', event.data.size);
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        console.log('[SecurityRecorder] Recording stopped, chunks:', chunksRef.current.length);
        
        if (chunksRef.current.length === 0) {
          console.error('[SecurityRecorder] No chunks recorded!');
          setUploadStatus('error');
          stopStream();
          if (onRecordingEnd) onRecordingEnd();
          return;
        }
        
        const blob = new Blob(chunksRef.current, { type: mimeType });
        console.log('[SecurityRecorder] Blob created, size:', blob.size);
        
        const endTime = new Date();
        const duration = Math.round((endTime - startTimeRef.current) / 1000);
        
        // Convertir a base64 usando ArrayBuffer para evitar problemas con el split
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64data = btoa(binary);
        
        console.log('[SecurityRecorder] Base64 length:', base64data?.length);
        
        if (!base64data || base64data.length < 100) {
          console.error('[SecurityRecorder] Invalid base64 data');
          setUploadStatus('error');
          stopStream();
          if (onRecordingEnd) onRecordingEnd();
          return;
        }
        
        // Subir al servidor
        setUploadStatus('uploading');
        try {
          const response = await uploadRecording({
            recording_type: 'both',
            mime_type: mimeType,
            duration_seconds: duration,
            started_at: startTimeRef.current.toISOString(),
            ended_at: endTime.toISOString(),
            recording_data: base64data
          });
          
          console.log('[SecurityRecorder] Upload successful:', response);
          setUploadStatus('success');
          if (onRecordingUploaded) {
            onRecordingUploaded(response);
          }
        } catch (err) {
          console.error('[SecurityRecorder] Error uploading recording:', err);
          setUploadStatus('error');
        }
        
        // Limpiar
        stopStream();
        
        if (onRecordingEnd) {
          onRecordingEnd();
        }
      };
      
      mediaRecorder.onerror = (event) => {
        console.error('[SecurityRecorder] MediaRecorder error:', event.error);
        setError(event.error?.message || 'Error en la grabación');
      };
      
      // Iniciar grabación
      startTimeRef.current = new Date();
      mediaRecorder.start(1000); // Chunk cada segundo
      setIsRecording(true);
      console.log('[SecurityRecorder] Recording started');
      
      if (onRecordingStart) {
        onRecordingStart();
      }
      
      // Timer para detener automáticamente después del tiempo máximo
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          console.log('[SecurityRecorder] Max duration reached, stopping');
          mediaRecorderRef.current.stop();
          setIsRecording(false);
        }
      }, maxDurationMs);
      
    } catch (err) {
      console.error('[SecurityRecorder] Error accessing media devices:', err);
      setHasPermission(false);
      setError(err.message || 'No se pudo acceder a la cámara/micrófono');
    } finally {
      isStartingRef.current = false;
    }
  }, [maxDurationMs, onRecordingStart, onRecordingEnd, onRecordingUploaded, uploadRecording, stopStream, isRecording]);

  // Efecto principal para manejar el inicio/fin de grabación
  useEffect(() => {
    console.log('[SecurityRecorder] isActive changed to:', isActive, 'isRecording:', isRecording);
    
    if (isActive && !isRecording && !isStartingRef.current) {
      startRecording();
    } else if (!isActive && isRecording) {
      stopRecording();
    }
    
    // Cleanup al desmontar
    return () => {
      console.log('[SecurityRecorder] Cleanup');
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      stopStream();
    };
  }, [isActive]);

  // Timer de countdown
  useEffect(() => {
    let interval;
    if (isRecording) {
      setRemainingTime(maxDurationMs / 1000);
      interval = setInterval(() => {
        setRemainingTime(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, maxDurationMs]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Si no está activo, no renderizar nada
  if (!isActive) return null;

  // Modo silencioso - solo graba sin mostrar interfaz visible
  // El video element es necesario pero oculto
  if (silent) {
    return (
      <video 
        ref={videoRef} 
        autoPlay 
        muted 
        playsInline
        style={{ 
          position: 'absolute',
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none'
        }}
      />
    );
  }

  // Modo con interfaz visible (para debugging o uso explícito)
  return (
    <div className="security-recorder">
      <div className="security-recorder-header">
        <div className="recording-indicator">
          {isRecording && (
            <>
              <span className="recording-dot"></span>
              <span>GRABANDO</span>
            </>
          )}
          {uploadStatus === 'uploading' && (
            <>
              <IconUpload size={16} />
              <span>Guardando...</span>
            </>
          )}
          {uploadStatus === 'success' && (
            <span className="upload-success">✓ Grabación guardada</span>
          )}
          {uploadStatus === 'error' && (
            <span className="upload-error">✗ Error al guardar</span>
          )}
        </div>
        {isRecording && (
          <div className="recording-timer">
            <IconCamera size={16} />
            <span>{formatTime(remainingTime)}</span>
          </div>
        )}
      </div>
      
      <div className="security-recorder-preview">
        <video 
          ref={videoRef} 
          autoPlay 
          muted 
          playsInline
          className="preview-video"
        />
        
        {hasPermission === false && (
          <div className="permission-error">
            <IconCamera size={32} />
            <p>Se requiere acceso a cámara y micrófono</p>
            <p className="error-detail">{error}</p>
            <button onClick={startRecording} className="retry-btn">
              Reintentar
            </button>
          </div>
        )}
      </div>
      
      <div className="security-recorder-footer">
        <div className="security-info">
          <IconMicrophone size={14} />
          <span>Sesión de seguridad activa - Grabación obligatoria</span>
        </div>
        {isRecording && (
          <button onClick={stopRecording} className="stop-btn">
            <IconStop size={16} />
            Detener
          </button>
        )}
      </div>
    </div>
  );
}
