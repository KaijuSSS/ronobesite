import { Minus, Plus, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  FONT_SIZE,
  LINE_HEIGHT,
  READER_FONTS,
  READER_THEMES,
  TEXT_WIDTH,
  useReaderSettings,
  type ReaderFont,
  type ReaderTheme,
} from '@/features/reader/settings-store'
import { cn } from '@/lib/utils'

export function ReaderSettingsPanel() {
  const settings = useReaderSettings()
  const { update } = settings

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2.5 text-sm font-medium">Тема</legend>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Тема читалки">
          {(Object.keys(READER_THEMES) as ReaderTheme[]).map((theme) => {
            const t = READER_THEMES[theme]
            const active = settings.theme === theme
            return (
              <button
                key={theme}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => update({ theme })}
                className={cn(
                  'flex h-14 flex-col items-center justify-center rounded-xl border-2 text-sm font-medium transition-all',
                  active ? 'border-primary' : 'border-transparent hover:border-white/20',
                )}
                style={{ background: t.bg, color: t.fg }}
              >
                <span className="font-serif text-base">Аа</span>
                <span className="text-[11px]">{t.label}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2.5 text-sm font-medium">Шрифт</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Шрифт">
          {(Object.keys(READER_FONTS) as ReaderFont[]).map((font) => (
            <button
              key={font}
              type="button"
              role="radio"
              aria-checked={settings.font === font}
              onClick={() => update({ font })}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm transition-colors',
                settings.font === font
                  ? 'border-primary bg-primary/15 text-foreground'
                  : 'border-white/10 text-muted-foreground hover:text-foreground',
              )}
              style={{ fontFamily: READER_FONTS[font].stack }}
            >
              {READER_FONTS[font].label}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-sm font-medium" id="font-size-label">
            Размер шрифта
          </span>
          <span className="text-sm text-muted-foreground tabular-nums">{settings.fontSize} px</span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label="Уменьшить шрифт"
            onClick={() => update({ fontSize: settings.fontSize - FONT_SIZE.step })}
            disabled={settings.fontSize <= FONT_SIZE.min}
          >
            <Minus />
          </Button>
          <Slider
            aria-labelledby="font-size-label"
            min={FONT_SIZE.min}
            max={FONT_SIZE.max}
            step={FONT_SIZE.step}
            value={[settings.fontSize]}
            onValueChange={([value]) => update({ fontSize: value })}
          />
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label="Увеличить шрифт"
            onClick={() => update({ fontSize: settings.fontSize + FONT_SIZE.step })}
            disabled={settings.fontSize >= FONT_SIZE.max}
          >
            <Plus />
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-sm font-medium" id="line-height-label">
            Межстрочный интервал
          </span>
          <span className="text-sm text-muted-foreground tabular-nums">{settings.lineHeight.toFixed(2)}</span>
        </div>
        <Slider
          aria-labelledby="line-height-label"
          min={LINE_HEIGHT.min}
          max={LINE_HEIGHT.max}
          step={LINE_HEIGHT.step}
          value={[settings.lineHeight]}
          onValueChange={([value]) => update({ lineHeight: value })}
        />
      </div>

      <div className="hidden sm:block">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-sm font-medium" id="width-label">
            Ширина текста
          </span>
          <span className="text-sm text-muted-foreground tabular-nums">{settings.width} px</span>
        </div>
        <Slider
          aria-labelledby="width-label"
          min={TEXT_WIDTH.min}
          max={TEXT_WIDTH.max}
          step={TEXT_WIDTH.step}
          value={[settings.width]}
          onValueChange={([value]) => update({ width: value })}
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="reader-justify" className="font-normal">
            Выравнивание по ширине
          </Label>
          <Switch id="reader-justify" checked={settings.justify} onCheckedChange={(justify) => update({ justify })} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="reader-autohide" className="font-normal">
            Скрывать панели при чтении
          </Label>
          <Switch
            id="reader-autohide"
            checked={settings.autoHideUi}
            onCheckedChange={(autoHideUi) => update({ autoHideUi })}
          />
        </div>
      </div>

      <Button variant="ghost" className="w-full" onClick={settings.reset}>
        <RotateCcw /> Сбросить настройки
      </Button>
    </div>
  )
}
