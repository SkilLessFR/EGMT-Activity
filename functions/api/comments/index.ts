import type { PagesFunction } from "@cloudflare/workers-types";
import { getBucharestDate } from "../../../src/shared/timezone";
import type {
  CommentsListResponse,
  CreateCommentRequest,
  CreateCommentResponse,
  TaskComment,
} from "../../../src/shared/types";
import {
  errorResponse,
  isNonEmptyString,
  isValidIsoDate,
  isValidMonthKey,
  jsonResponse,
  parseJsonBody,
} from "../_lib/http";
import {
  commentsMonthKey,
  type Env,
  getMonthComments,
} from "../_lib/kv";

const MAX_PHOTO_DATA_URL_LENGTH = 500_000;

function validateCreateComment(body: Record<string, unknown>): {
  errors: string[];
  data?: CreateCommentRequest;
} {
  const errors: string[] = [];

  if (!isNonEmptyString(body.occurrenceId)) {
    errors.push("occurrenceId is required and must be a non-empty string");
  }
  if (!isNonEmptyString(body.taskId)) {
    errors.push("taskId is required and must be a non-empty string");
  }
  if (!isNonEmptyString(body.taskTitle)) {
    errors.push("taskTitle is required and must be a non-empty string");
  }
  if (!isValidIsoDate(body.scheduledDate)) {
    errors.push("scheduledDate must be a valid YYYY-MM-DD date");
  }
  if (!isNonEmptyString(body.author)) {
    errors.push("author is required and must be a non-empty string");
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const photoDataUrl =
    typeof body.photoDataUrl === "string" && body.photoDataUrl.trim().length > 0
      ? body.photoDataUrl.trim()
      : undefined;

  if (!message && !photoDataUrl) {
    errors.push("message or photo attachment is required");
  }

  if (photoDataUrl !== undefined) {
    if (!photoDataUrl.startsWith("data:image/")) {
      errors.push("photoDataUrl must be a valid image data URL");
    } else if (photoDataUrl.length > MAX_PHOTO_DATA_URL_LENGTH) {
      errors.push("Attached photo is too large; please use a smaller image");
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors: [],
    data: {
      occurrenceId: (body.occurrenceId as string).trim(),
      taskId: (body.taskId as string).trim(),
      taskTitle: (body.taskTitle as string).trim(),
      scheduledDate: body.scheduledDate as string,
      author: (body.author as string).trim(),
      message,
      ...(photoDataUrl !== undefined ? { photoDataUrl } : {}),
    },
  };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const dateParam = url.searchParams.get("date");
  const monthParam = url.searchParams.get("month");

  let monthKey: string;
  if (dateParam !== null) {
    if (!isValidIsoDate(dateParam)) {
      return errorResponse("Invalid date parameter; expected YYYY-MM-DD", 400);
    }
    monthKey = dateParam.slice(0, 7);
  } else if (monthParam !== null) {
    if (!isValidMonthKey(monthParam)) {
      return errorResponse("Invalid month parameter; expected YYYY-MM", 400);
    }
    monthKey = monthParam;
  } else {
    monthKey = getBucharestDate().slice(0, 7);
  }

  const kv = context.env.EGMT_ACTIVIT;
  let comments = await getMonthComments(kv, monthKey);
  if (dateParam !== null) {
    comments = comments.filter((c) => c.scheduledDate === dateParam);
  }

  comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const response: CommentsListResponse = { comments };
  return jsonResponse(response, 200);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const parsed = await parseJsonBody<Record<string, unknown>>(context.request);
  if (!parsed.ok) {
    return parsed.response;
  }

  const validation = validateCreateComment(parsed.data);
  if (validation.errors.length > 0 || !validation.data) {
    return errorResponse("Validation failed", 400, validation.errors);
  }

  const req = validation.data;
  const monthKey = req.scheduledDate.slice(0, 7);
  const kv = context.env.EGMT_ACTIVIT;

  const existing = await getMonthComments(kv, monthKey);
  const comment: TaskComment = {
    id: crypto.randomUUID(),
    occurrenceId: req.occurrenceId,
    taskId: req.taskId,
    taskTitle: req.taskTitle,
    scheduledDate: req.scheduledDate,
    author: req.author,
    message: req.message,
    ...(req.photoDataUrl !== undefined ? { photoDataUrl: req.photoDataUrl } : {}),
    createdAt: new Date().toISOString(),
  };

  const next = [...existing, comment];
  await kv.put(commentsMonthKey(monthKey), JSON.stringify(next));

  const response: CreateCommentResponse = { comment };
  return jsonResponse(response, 201);
};
