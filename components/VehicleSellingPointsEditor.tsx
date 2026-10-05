import { useId } from "react";
import {
  MAX_SELLING_POINTS,
  SELLING_POINT_LIMITS,
  sellingPointsSchema,
  type VehicleSellingPoint,
} from "../lib/selling-points";

const presets: VehicleSellingPoint[] = [
  { zh: "低首付", en: "Low down payment" },
  { zh: "低里程", en: "Low mileage" },
  { zh: "新到店", en: "Just arrived" },
  { zh: "一手车", en: "One owner" },
];

export function VehicleSellingPointsEditor({
  value,
  onChange,
  disabled,
  sold,
}: {
  value: VehicleSellingPoint[];
  onChange: (value: VehicleSellingPoint[]) => void;
  disabled: boolean;
  sold: boolean;
}) {
  const id = useId();
  const validation = sellingPointsSchema.safeParse(value);
  const full = value.length >= MAX_SELLING_POINTS;
  const update = (index: number, language: "zh" | "en", text: string) =>
    onChange(
      value.map((point, at) =>
        at === index ? { ...point, [language]: text } : point,
      ),
    );
  return (
    <fieldset
      className="selling-points-editor"
      disabled={disabled}
      aria-describedby={`${id}-help`}
    >
      <legend>
        <h2>卖点标签 / Selling points</h2>
      </legend>
      <p id={`${id}-help`}>
        每辆最多 {MAX_SELLING_POINTS}{" "}
        个，显示在车辆照片左上角。可选常用标签，或填写自定义卖点；英文选填，未填写时显示中文。
      </p>
      {sold && (
        <p className="selling-points-editor-note">
          这辆车已售，卖点标签会保留，但不会在网站上显示。
        </p>
      )}
      <div className="selling-point-presets" aria-label="常用卖点标签">
        {presets.map((point) => (
          <button
            type="button"
            className="selling-point-preset"
            key={point.en}
            disabled={
              full ||
              value.some(
                (item) =>
                  item.zh.trim() === point.zh ||
                  item.en.trim().toLowerCase() === point.en.toLowerCase(),
              )
            }
            onClick={() => onChange([...value, { ...point }])}
          >
            {point.zh}
          </button>
        ))}
      </div>
      {value.map((point, index) => (
        <div className="selling-point-edit-row" key={index}>
          <div className="selling-point-row-heading">
            <strong>标签 {index + 1}</strong>
            <div>
              {index > 0 && (
                <button
                  type="button"
                  className="text-button"
                  aria-label={`上移标签 ${index + 1}`}
                  onClick={() => onChange([value[1], value[0]])}
                >
                  上移
                </button>
              )}
              <button
                type="button"
                className="text-button"
                aria-label={`删除标签 ${index + 1}`}
                onClick={() => onChange(value.filter((_, at) => at !== index))}
              >
                删除
              </button>
            </div>
          </div>
          <div className="editor-fields editor-fields--two-equal">
            <label className="field">
              <span>中文 · 最多 {SELLING_POINT_LIMITS.zh} 字</span>
              <input
                aria-label={`标签 ${index + 1} 中文`}
                value={point.zh}
                maxLength={SELLING_POINT_LIMITS.zh}
                onChange={(event) => update(index, "zh", event.target.value)}
                placeholder="例如：低里程"
              />
            </label>
            <label className="field">
              <span>English · 最多 {SELLING_POINT_LIMITS.en} 字符</span>
              <input
                aria-label={`标签 ${index + 1} English`}
                value={point.en}
                maxLength={SELLING_POINT_LIMITS.en}
                onChange={(event) => update(index, "en", event.target.value)}
                placeholder="e.g. Low mileage"
              />
            </label>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="text-button"
        disabled={full}
        onClick={() => onChange([...value, { zh: "", en: "" }])}
      >
        添加自定义标签
      </button>
      {!validation.success && (
        <p className="form-error" role="status">
          每个标签至少填写一种语言，标签内容不能重复。无需的标签可直接删除。
        </p>
      )}
      {value.some((point) => point.zh.trim() || point.en.trim()) && (
        <div className="selling-point-preview" aria-label="卖点标签预览">
          <span>预览</span>
          <ul className="vehicle-selling-points">
            {value.map((point, index) => {
              const text = point.zh.trim() || point.en.trim();
              return text ? (
                <li key={index} title={text}>
                  {text}
                </li>
              ) : null;
            })}
          </ul>
        </div>
      )}
      <p className="selling-points-save-hint">
        随车辆一起保存，未选择标签的车辆保持原样。
      </p>
    </fieldset>
  );
}
