import emailjs from '@emailjs/browser';
import { useCallback, useState } from 'react';
import { useToast } from '../design';

export interface EmailJsTemplateParams {
  from_name: string;
  from_email: string;
  category: string;
  subject: string;
  message: string;
  app_name?: string;
}

function getEmailJsConfig() {
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID?.trim() ?? '';
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID?.trim() ?? '';
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY?.trim() ?? '';
  return { serviceId, templateId, publicKey };
}

export function isEmailJsConfigured(): boolean {
  const { serviceId, templateId, publicKey } = getEmailJsConfig();
  return Boolean(serviceId && templateId && publicKey);
}

/**
 * Sends a non-sensitive email (contact, feedback, support) from the browser
 * via EmailJS. Never use this for OTPs, password resets, or secrets.
 */
export async function sendEmail(
  templateParams: EmailJsTemplateParams,
  options?: { templateId?: string },
): Promise<void> {
  const { serviceId, templateId: defaultTemplateId, publicKey } = getEmailJsConfig();
  const templateId = options?.templateId ?? defaultTemplateId;

  if (!serviceId || !templateId || !publicKey) {
    throw new Error('EmailJS is not configured (missing VITE_EMAILJS_* environment variables).');
  }

  await emailjs.send(
    serviceId,
    templateId,
    {
      app_name: 'LearnSpace',
      ...templateParams,
    },
    { publicKey },
  );
}

export function useEmailSender() {
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendWithToast = useCallback(
    async (
      params: EmailJsTemplateParams,
      messages?: { successTitle?: string; successDescription?: string },
    ): Promise<boolean> => {
      setSending(true);
      setError(null);
      try {
        await sendEmail(params);
        toast.show({
          kind: 'success',
          title: messages?.successTitle ?? 'Message sent',
          description: messages?.successDescription ?? 'Thanks! We received your message.',
        });
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not send email right now.';
        setError(msg);
        toast.show({
          kind: 'error',
          title: 'Email failed',
          description: msg,
        });
        return false;
      } finally {
        setSending(false);
      }
    },
    [toast],
  );

  return { sending, error, sendWithToast };
}

