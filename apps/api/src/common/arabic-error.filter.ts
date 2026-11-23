import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

/** كل الأخطاء تُرجَع برسالة عربية ورمز ثابت، بلا تفاصيل تقنية للمستخدم. */
const DEFAULT_MESSAGES: Record<number, { code: string; message: string }> = {
  400: { code: 'BAD_REQUEST', message: 'البيانات المرسلة غير صحيحة.' },
  401: { code: 'UNAUTHORIZED', message: 'سجّل الدخول أولاً.' },
  403: { code: 'FORBIDDEN', message: 'لا تملك صلاحية لهذا الإجراء.' },
  404: { code: 'NOT_FOUND', message: 'العنصر المطلوب غير موجود.' },
  413: { code: 'FILE_TOO_LARGE', message: 'حجم الملف أكبر من المسموح (5 ميغابايت).' },
  429: { code: 'TOO_MANY_REQUESTS', message: 'محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.' },
  500: { code: 'SERVER_ERROR', message: 'حدث خطأ في الخادم. حاول مرة أخرى بعد قليل.' },
};

@Catch()
export class ArabicErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const fallback = DEFAULT_MESSAGES[status] ?? DEFAULT_MESSAGES[500];
    let body = fallback;
    if (exception instanceof HttpException) {
      const r = exception.getResponse();
      if (typeof r === 'object' && r && 'code' in r && 'message' in r) body = r as typeof fallback;
    } else {
      console.error(exception);
    }
    res.status(status).json({ statusCode: status, ...body });
  }
}

/** خطأ بنص عربي ورمز ثابت. */
export class AppError extends HttpException {
  constructor(status: number, code: string, message: string) {
    super({ code, message }, status);
  }
}
