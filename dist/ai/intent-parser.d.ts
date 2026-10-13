import type { TaskType } from "../types/tasks.js";
export interface ParsedIntent {
    isCommand: boolean;
    type: TaskType | "chat_reply" | "unauthorized" | "ignored";
    title: string;
    params: Record<string, unknown>;
    feedbackMessage: string;
}
export declare class ChatIntentParser {
    parse(username: string, rawMessage: string, triggerPrefix?: string): ParsedIntent;
}
export declare const chatIntentParser: ChatIntentParser;
