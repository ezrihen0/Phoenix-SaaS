export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

export type EmailSendInput = {
  to: string;
  subject: string;
  body: string;
  html?: string;
  attachments?: EmailAttachment[];
};

export type EmailSendResult = {
  messageId: string;
  sentAt: Date;
};
