package com.campusreserve.common;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.regex.Pattern;

/**
 * 契约里两种时间字面量的解析与格式化（`YYYY-MM-DD` 与 `HH:mm`）。
 *
 * 为什么不用 `DateTimeFormatter` 直接解析：
 * 格式器与 `ResolverStyle` 的组合有几处反直觉的地方（例如 `yyyy` 在严格模式下要求纪元、
 * `02-31` 这类不存在的日期在宽松模式下会被"纠正"成 3 月 3 日）。
 * 这里改成「先按正则卡死形状，再用 ISO 解析」，规则一眼可见、不会随 JDK 行为漂移。
 *
 * 解析失败一律抛 {@link BizException#param(String)}（错误码 400001）：
 * 「字段格式非法」在契约里属于参数错误，与「时间不合法（400002）」是两回事——
 * 前者是客户端传错了，后者是传对了但不允许。
 */
public final class TimeFormats {

    /** 日期形状：四位年-两位月-两位日 */
    private static final Pattern DATE_PATTERN = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");

    /** 时刻形状：00:00 ~ 23:59 */
    private static final Pattern TIME_PATTERN = Pattern.compile("^([01]\\d|2[0-3]):[0-5]\\d$");

    private TimeFormats() {
    }

    /**
     * 解析 `YYYY-MM-DD`。
     *
     * 正则只保证形状，真实性交给 ISO 解析——`2026-02-31` 会在这里被拒绝，
     * 而需求 §4.5「日期合法」要求的正是这一点。
     */
    public static LocalDate parseDate(String raw) {
        if (raw == null || !DATE_PATTERN.matcher(raw).matches()) {
            throw BizException.param("预约日期不合法，请重新选择日期");
        }
        try {
            return LocalDate.parse(raw);
        } catch (DateTimeParseException ex) {
            throw BizException.param("预约日期不合法，请重新选择日期");
        }
    }

    /** 解析 `HH:mm`，只接受规定的形状，不接受 `9:00` 或 `09:00:00` */
    public static LocalTime parseTime(String raw) {
        if (raw == null || !TIME_PATTERN.matcher(raw).matches()) {
            throw BizException.param("预约时间格式不正确，请重新选择时间段");
        }
        return LocalTime.of(Integer.parseInt(raw.substring(0, 2)), Integer.parseInt(raw.substring(3, 5)));
    }

    /** 格式化为 `HH:mm`，用于生成可用时间段与 `open_slots` 比较 */
    public static String format(LocalTime time) {
        return String.format("%02d:%02d", time.getHour(), time.getMinute());
    }
}
