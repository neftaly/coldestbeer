#include "epaper_weact_3c.h"
#include "esphome/core/log.h"

namespace esphome::epaper_spi {

static constexpr const char *const TAG = "epaper_weact_3c";
static constexpr uint8_t PARTIAL_REFRESH_PASSES = 1;

// B/W partial refresh LUT from GxEPD2_213_BN. Single pass, ~0.75s.
// Only BW/WB transitions get driven. BB/WW = no drive (unchanged pixels stay still).
// clang-format off
static const uint8_t LUT_PARTIAL[] = {
  0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // BB
  0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // BW
  0x40, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // WB
  0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // WW
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // VCOM
  0x0A, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02,
  0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x00, 0x00, 0x00,
};
// clang-format on

enum class BwrState : uint8_t {
  BWR_BLACK,
  BWR_WHITE,
  BWR_RED,
};

static BwrState color_to_bwr(Color color) {
  if (color.r > color.g + color.b && color.r > 127) {
    return BwrState::BWR_RED;
  }
  if (color.r + color.g + color.b >= 382) {
    return BwrState::BWR_WHITE;
  }
  return BwrState::BWR_BLACK;
}

void EPaperWeAct3C::draw_pixel_at(int x, int y, Color color) {
  if (!this->rotate_coordinates_(x, y))
    return;

  const uint32_t pos = (x / 8) + (y * this->row_width_);
  const uint8_t bit = 0x80 >> (x & 0x07);
  auto bwr = color_to_bwr(color);

  // Update B/W plane (first half of buffer)
  if (bwr == BwrState::BWR_WHITE) {
    this->buffer_[pos] |= bit;
  } else {
    this->buffer_[pos] &= ~bit;
  }

  // In partial mode, Red plane holds the previous B/W frame for old/new
  // comparison — don't touch it. Only update Red plane in full mode.
  // Lambda runs before initialise(), so update_count_==0 means full refresh.
  if (this->update_count_ == 0) {
    const uint32_t red_offset = this->buffer_length_ / 2u;
    if (bwr == BwrState::BWR_RED) {
      this->buffer_[red_offset + pos] |= bit;
    } else {
      this->buffer_[red_offset + pos] &= ~bit;
    }
  }
}

void EPaperWeAct3C::fill(Color color) {
  const size_t half_buffer = this->buffer_length_ / 2u;
  auto bits = color_to_bwr(color);

  // Fill B/W plane
  uint8_t bw_val = (bits == BwrState::BWR_WHITE) ? 0xFF : 0x00;
  for (size_t i = 0; i < half_buffer; i++)
    this->buffer_[i] = bw_val;

  // In partial mode, Red plane holds the previous B/W frame — don't touch it.
  if (this->update_count_ == 0) {
    uint8_t red_val = (bits == BwrState::BWR_RED) ? 0xFF : 0x00;
    for (size_t i = 0; i < half_buffer; i++)
      this->buffer_[half_buffer + i] = red_val;
  }

  // Set dirty region so the update isn't skipped
  this->x_high_ = this->width_;
  this->y_high_ = this->height_;
  this->x_low_ = 0;
  this->y_low_ = 0;
}

void EPaperWeAct3C::clear() {
  this->fill(COLOR_ON);
}

bool EPaperWeAct3C::initialise(bool partial) {
  EPaperBase::initialise(partial);
  this->partial_ = partial;
  if (partial) {
    // Border waveform: 0x80 = VCOM (required for partial, GxEPD2 convention)
    this->cmd_data(0x3C, {0x80});

    // Scale TP0 to fill the available update interval.
    // Base: TP0=10 with RP=2 gives ~750ms. Each TP unit ≈ 62ms total drive time.
    uint8_t lut_buf[sizeof(LUT_PARTIAL)];
    memcpy(lut_buf, LUT_PARTIAL, sizeof(LUT_PARTIAL));
    uint32_t interval_ms = this->get_update_interval();
    uint32_t available_ms = (interval_ms > 500) ? interval_ms - 500 : 100;
    uint32_t tp0 = (available_ms * 10) / 750;
    if (tp0 < 1) tp0 = 1;
    if (tp0 > 255) tp0 = 255;
    lut_buf[60] = (uint8_t) tp0;
    ESP_LOGD(TAG, "Partial refresh: TP0=%u (interval=%ums, available=%ums)", tp0, interval_ms, available_ms);

    this->cmd_data(0x32, lut_buf, sizeof(lut_buf));
    if (!this->prev_frame_valid_) {
      // First partial after full: fill Red plane with 0xFF (all white baseline)
      const size_t half = this->buffer_length_ / 2u;
      for (size_t i = half; i < this->buffer_length_; i++) {
        this->buffer_[i] = 0xFF;
      }
      this->prev_frame_valid_ = true;
    }
  } else {
    // Full refresh: lambda already wrote correct Red plane data via
    // update_count_==0 check. Just reset prev_frame_valid_.
    this->prev_frame_valid_ = false;
  }
  return true;
}

void EPaperWeAct3C::set_window_() {
  uint16_t x_start = 0;
  uint16_t x_end = this->width_ - 1;
  uint16_t y_start = 0;
  uint16_t y_end = this->height_ - 1;

  this->cmd_data(0x44, {(uint8_t) (x_start / 8), (uint8_t) (x_end / 8)});
  this->cmd_data(0x45, {(uint8_t) y_start, (uint8_t) (y_start >> 8), (uint8_t) (y_end & 0xFF), (uint8_t) (y_end >> 8)});
  this->cmd_data(0x4E, {(uint8_t) (x_start / 8)});
  this->cmd_data(0x4F, {(uint8_t) y_start, (uint8_t) (y_start >> 8)});
}

bool HOT EPaperWeAct3C::transfer_data() {
  const uint32_t start_time = millis();
  const size_t buffer_length = this->buffer_length_;
  const size_t half_buffer = buffer_length / 2u;

  uint8_t bytes_to_send[MAX_TRANSFER_SIZE];

  // Phase 1: Write Red plane (buffer second half) to register 0x26.
  // Full mode: actual red color data.
  // Partial mode: previous B/W frame (for old/new comparison).
  if (this->current_data_index_ < half_buffer) {
    if (this->current_data_index_ == 0) {
      this->set_window_();
      this->command(0x26);
    }

    this->start_data_();
    while (this->current_data_index_ < half_buffer) {
      size_t bytes_to_copy = std::min(MAX_TRANSFER_SIZE, half_buffer - this->current_data_index_);

      for (size_t i = 0; i < bytes_to_copy; i++) {
        bytes_to_send[i] = this->buffer_[half_buffer + this->current_data_index_ + i];
      }

      this->write_array(bytes_to_send, bytes_to_copy);
      this->current_data_index_ += bytes_to_copy;

      if (millis() - start_time > MAX_TRANSFER_TIME) {
        this->disable();
        return false;
      }
    }
    this->disable();
  }

  // Phase 2: Write B/W plane (buffer first half) to register 0x24.
  if (this->current_data_index_ < buffer_length) {
    if (this->current_data_index_ == half_buffer) {
      this->command(0x24);
    }

    this->start_data_();
    while (this->current_data_index_ < buffer_length) {
      size_t remaining = buffer_length - this->current_data_index_;
      size_t bytes_to_copy = std::min(MAX_TRANSFER_SIZE, remaining);
      size_t buffer_offset = this->current_data_index_ - half_buffer;

      for (size_t i = 0; i < bytes_to_copy; i++) {
        bytes_to_send[i] = this->buffer_[buffer_offset + i];
      }

      this->write_array(bytes_to_send, bytes_to_copy);
      this->current_data_index_ += bytes_to_copy;

      if (millis() - start_time > MAX_TRANSFER_TIME) {
        this->disable();
        return false;
      }
    }
    this->disable();
  }

  // In partial mode, copy current B/W frame into Red plane as the
  // "old" reference for the next partial refresh.
  if (this->partial_) {
    for (size_t i = 0; i < half_buffer; i++) {
      this->buffer_[half_buffer + i] = this->buffer_[i];
    }
  }

  this->current_data_index_ = 0;
  return true;
}

void EPaperWeAct3C::refresh_screen(bool partial) {
  this->cmd_data(0x4E, {0x00});
  this->cmd_data(0x4F, {0x00, 0x00});

  if (!partial) {
    this->cmd_data(0x22, {0xF7});
    this->command(0x20);
    return;
  }

  // Partial: multiple passes to build contrast.
  // RAM retains old/new between passes, so the same transitions fire again,
  // driving pixels further each time.
  for (uint8_t i = 0; i < PARTIAL_REFRESH_PASSES; i++) {
    this->cmd_data(0x22, {0xCC});
    this->command(0x20);
    if (i < PARTIAL_REFRESH_PASSES - 1) {
      // Wait for this pass to finish before starting the next.
      // The state machine handles the final BUSY wait externally.
      while (this->busy_pin_ != nullptr && this->busy_pin_->digital_read()) {
        delay(1);
      }
    }
  }
}

void EPaperWeAct3C::power_on() {
  this->cmd_data(0x22, {0xF8});
  this->command(0x20);
}

void EPaperWeAct3C::power_off() {
  this->cmd_data(0x22, {0x83});
  this->command(0x20);
}

void EPaperWeAct3C::deep_sleep() {
  this->cmd_data(0x10, {0x01});
}

}  // namespace esphome::epaper_spi
