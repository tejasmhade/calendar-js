class PropjiniDatePicker {
    constructor(elementId, config = {}) {
        this.input = document.getElementById(elementId);
        if (!this.input) {
            console.error(`PropjiniDatePicker: Element with id "${elementId}" not found`);
            return;
        }
        
        this.container = this.input.parentElement;
        
        // Determine picker mode (priority: PickTimeOnly > PickDateOnly > PickDateTimeBoth > default both)
        const pickTimeOnly = config.PickTimeOnly ?? false;
        const pickDateOnly = config.PickDateOnly ?? false;
        const pickDateTimeBoth = config.PickDateTimeBoth ?? (!pickTimeOnly && !pickDateOnly);
        
        this.config = {
            PickDateTimeBoth: pickDateTimeBoth && !pickTimeOnly && !pickDateOnly,
            PickDateOnly: pickDateOnly && !pickTimeOnly,
            PickTimeOnly: pickTimeOnly,
            AllowPastDateTime: config.AllowPastDateTime ?? true,
            showShortcuts: config.showShortcuts ?? true,
            defaultTime: config.defaultTime ?? "07:00 PM",
            ...config
        };

        this.selectedDate = new Date();
        this.viewDate = new Date();
        this.selectedTime = this.config.defaultTime;
        this.isFirstTimeOpen = true; // Track if this is the first time opening the modal
        
        // Store bound methods for cleanup
        this.boundHandlers = {};
        
        this.init();
    }

    init() {
        this.renderBaseHTML();
        this.modal = this.container.querySelector('.picker-modal');
        
        // Set default position class
        this.modal.classList.add('position-bottom');

        // Cache commonly used elements
        this.elements = {
            modal: this.modal,
            daysGrid: this.modal.querySelector('.days-grid'),
            monthSelect: this.modal.querySelector('.month-select'),
            yearSelect: this.modal.querySelector('.year-select'),
            timeGrid: this.modal.querySelector('.time-grid')
        };

        // Precompute time sections once
        this.timeSections = this.buildTimeSections();
        this.allTimes = this.timeSections.reduce((acc, section) => acc.concat(section.times), []);
        
        if (this.config.PickDateOnly || this.config.PickDateTimeBoth) {
            this.populateDropdowns();
            this.renderCalendar();
        }
        
        this.attachEventListeners();
        
        if (this.config.PickTimeOnly || this.config.PickDateTimeBoth) {
            this.renderTimeGrid();
        }
    }

    renderBaseHTML() {
        const showTodayBtn = this.config.PickDateOnly || this.config.PickDateTimeBoth;
        
        const calendarSectionHTML = (this.config.PickDateOnly || this.config.PickDateTimeBoth) ? `
                    <div class="calendar-section">
                        <div class="month-label">
                            <button class="nav-btn prev-m" aria-label="Previous month">&lt;</button>
                            <select class="month-select" aria-label="Select month"></select>
                            <select class="year-select" aria-label="Select year"></select>
                            <button class="nav-btn next-m" aria-label="Next month">&gt;</button>
                        </div>
                        <div class="days-grid">
                            <div class="day-name">S</div>
                            <div class="day-name">M</div>
                            <div class="day-name">T</div>
                            <div class="day-name">W</div>
                            <div class="day-name">T</div>
                            <div class="day-name">F</div>
                            <div class="day-name">S</div>
                        </div>
                    </div>
        ` : '';
        
        const timeSectionHTML = (this.config.PickTimeOnly || this.config.PickDateTimeBoth) 
            ? '<div class="time-section"><div class="time-grid"></div></div>' 
            : '';
        
        // Add class to modal body based on mode
        let modalBodyClass = '';
        if (this.config.PickTimeOnly) {
            modalBodyClass = 'time-only-mode';
        } else if (this.config.PickDateOnly) {
            modalBodyClass = 'date-only-mode';
        } else {
            modalBodyClass = 'both-mode';
        }
        
        this.container.insertAdjacentHTML('beforeend', `
            <div class="picker-modal">
                <div class="modal-header">
                    <button class="btn-link btn-clear">Clear</button>
                    ${showTodayBtn ? '<button class="btn-link btn-today">Today</button>' : ''}
                    <button class="btn-link btn-apply">Apply</button>
                </div>
                <div class="modal-body ${modalBodyClass}">
                    ${calendarSectionHTML}
                    ${timeSectionHTML}
                </div>
            </div>
        `);
    }

    buildTimeSections() {
        const timeSections = {
            morning: [],
            afternoon: [],
            evening: []
        };
        
        for (let hour = 8; hour <= 20; hour++) {
            const period = hour >= 12 ? 'PM' : 'AM';
            let displayHour = hour;
            
            // Convert 24-hour to 12-hour format
            if (hour === 0) {
                displayHour = 12;
            } else if (hour === 12) {
                displayHour = 12;
            } else if (hour > 12) {
                displayHour = hour - 12;
            }
            
            const time00 = `${displayHour}:00 ${period}`;
            const time30 = hour < 20 ? `${displayHour}:30 ${period}` : null;
            
            // Categorize into sections
            if (hour < 12) {
                // Morning: 8 AM - 11:30 AM
                timeSections.morning.push(time00);
                if (time30) timeSections.morning.push(time30);
            } else if (hour < 18) {
                // Afternoon: 12 PM - 5:30 PM
                timeSections.afternoon.push(time00);
                if (time30) timeSections.afternoon.push(time30);
            } else {
                // Evening: 6 PM - 8 PM
                timeSections.evening.push(time00);
                if (time30) timeSections.evening.push(time30);
            }
        }
        
        return [
            { name: 'morning', label: 'Morning', times: timeSections.morning },
            { name: 'afternoon', label: 'Afternoon', times: timeSections.afternoon },
            { name: 'evening', label: 'Evening', times: timeSections.evening }
        ];
    }

    formatDateKey(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    positionModal() {
        if (!this.modal) {
            return;
        }
        
        // Get input position and dimensions
        const inputRect = this.input.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
        // Get modal dimensions (modal should be rendered but may not be visible)
        const modalRect = this.modal.getBoundingClientRect();
        const modalHeight = modalRect.height || 400; // fallback estimate
        const modalWidth = modalRect.width || 480;
        
        // Calculate available space below and above
        const spaceBelow = viewportHeight - inputRect.bottom;
        const spaceAbove = inputRect.top;
        
        // Required space includes some margin
        const requiredSpace = modalHeight + 20;
        
        // Remove previous positioning classes
        this.modal.classList.remove('position-top', 'position-bottom');
        
        // Position modal at top if not enough space below, or if more space available above
        if (spaceBelow < requiredSpace && spaceAbove > spaceBelow) {
            this.modal.classList.add('position-top');
        } else {
            this.modal.classList.add('position-bottom');
        }
        
        // Handle horizontal positioning to prevent overflow
        if (inputRect.left + modalWidth > viewportWidth - 10) {
            // Shift left if modal would overflow right edge
            const overflow = (inputRect.left + modalWidth) - (viewportWidth - 10);
            this.modal.style.left = `${Math.max(-inputRect.left + 10, -overflow)}px`;
        } else if (inputRect.left < 10) {
            // Shift right if too close to left edge
            this.modal.style.left = `${10 - inputRect.left}px`;
        } else {
            this.modal.style.left = '0';
        }
    }

    attachEventListeners() {
        // Toggle Open - bound for cleanup
        this.boundHandlers.inputClick = (e) => {
            e.stopPropagation();
            document.querySelectorAll('.picker-modal').forEach(m => {
                if (m !== this.modal) m.classList.remove('active');
            });
            this.modal.classList.add('active');
            
            // Position modal based on available space
            // Use setTimeout to ensure modal is rendered first
            setTimeout(() => {
                this.positionModal();
            }, 10);
            
            // Re-render time grid to auto-select first available time when modal opens
            if (this.config.PickTimeOnly || this.config.PickDateTimeBoth) {
                setTimeout(() => {
                    this.renderTimeGrid();
                    // Reposition after time grid is rendered (height may change)
                    this.positionModal();
                    // Reset flag after first render
                    this.isFirstTimeOpen = false;
                }, 50);
            }
        };
        this.input.addEventListener('click', this.boundHandlers.inputClick);

        // Stop propagation inside modal so day/time clicks don't close it
        this.boundHandlers.modalClick = (e) => e.stopPropagation();
        this.modal.addEventListener('click', this.boundHandlers.modalClick);
        
        // Reposition modal on window resize or scroll
        this.boundHandlers.reposition = () => {
            if (this.modal && this.modal.classList.contains('active')) {
                this.positionModal();
            }
        };
        window.addEventListener('resize', this.boundHandlers.reposition);
        window.addEventListener('scroll', this.boundHandlers.reposition, true);

        // Header Actions
        const clearBtn = this.modal.querySelector('.btn-clear');
        const todayBtn = this.modal.querySelector('.btn-today');
        const applyBtn = this.modal.querySelector('.btn-apply');
        
        this.boundHandlers.clear = () => {
            this.input.value = '';
            this.modal.classList.remove('active');
        };
        clearBtn.addEventListener('click', this.boundHandlers.clear);
        
        if (todayBtn) {
            this.boundHandlers.today = () => {
                const today = new Date();
                this.viewDate = new Date(today);
                this.selectedDate = new Date(today);
                if (this.config.PickDateOnly || this.config.PickDateTimeBoth) {
                    this.renderCalendar();
                }
                if (this.config.PickTimeOnly || this.config.PickDateTimeBoth) {
                    this.renderTimeGrid();
                }
            };
            todayBtn.addEventListener('click', this.boundHandlers.today);
        }
        
        this.boundHandlers.set = () => this.apply();
        applyBtn.addEventListener('click', this.boundHandlers.set);

        // Month Navigation Arrows
        const prevBtn = this.modal.querySelector('.prev-m');
        const nextBtn = this.modal.querySelector('.next-m');
        
        if (prevBtn && nextBtn) {
            this.boundHandlers.prevMonth = () => {
                this.viewDate.setMonth(this.viewDate.getMonth() - 1);
                this.renderCalendar();
            };
            this.boundHandlers.nextMonth = () => {
                this.viewDate.setMonth(this.viewDate.getMonth() + 1);
                this.renderCalendar();
            };
            
            prevBtn.addEventListener('click', this.boundHandlers.prevMonth);
            nextBtn.addEventListener('click', this.boundHandlers.nextMonth);
        }

        // Global Close - bound for cleanup
        this.boundHandlers.windowClick = () => {
            if (this.modal.classList.contains('active')) {
                this.modal.classList.remove('active');
            }
        };
        window.addEventListener('click', this.boundHandlers.windowClick);

        // Calendar day selection (event delegation)
        if (this.elements.daysGrid) {
            this.boundHandlers.dayClick = (e) => {
                const dayEl = e.target.closest('.day-num');
                if (!dayEl || dayEl.classList.contains('disabled')) return;
                
                const dateKey = dayEl.getAttribute('data-date');
                if (!dateKey) return;
                
                const [year, month, day] = dateKey.split('-').map(Number);
                this.selectedDate = new Date(year, month - 1, day);
                this.renderCalendar();
                if (this.config.PickTimeOnly || this.config.PickDateTimeBoth) {
                    // Reset selected time to null so first available time gets auto-selected
                    this.selectedTime = null;
                    this.renderTimeGrid();
                }
            };
            
            this.boundHandlers.dayKeydown = (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    const dayEl = e.target.closest('.day-num');
                    if (dayEl && !dayEl.classList.contains('disabled')) {
                        e.preventDefault();
                        dayEl.click();
                    }
                }
            };
            
            this.elements.daysGrid.addEventListener('click', this.boundHandlers.dayClick);
            this.elements.daysGrid.addEventListener('keydown', this.boundHandlers.dayKeydown);
        }

        // Time selection (event delegation)
        if (this.elements.timeGrid) {
            this.boundHandlers.timeClick = (e) => {
                const chip = e.target.closest('.time-chip');
                if (!chip || chip.classList.contains('disabled')) return;
                
                const timeValue = chip.getAttribute('data-time');
                if (!timeValue) return;
                
                this.selectedTime = timeValue;
                this.renderTimeGrid();
            };
            
            this.boundHandlers.timeKeydown = (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    const chip = e.target.closest('.time-chip');
                    if (chip && !chip.classList.contains('disabled')) {
                        e.preventDefault();
                        chip.click();
                    }
                }
            };
            
            this.elements.timeGrid.addEventListener('click', this.boundHandlers.timeClick);
            this.elements.timeGrid.addEventListener('keydown', this.boundHandlers.timeKeydown);
        }
    }

    populateDropdowns() {
        const mSelect = this.elements.monthSelect;
        const ySelect = this.elements.yearSelect;
        if (!mSelect || !ySelect) return;
        
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        
        mSelect.innerHTML = months.map((m, i) => `<option value="${i}">${m}</option>`).join('');
        
        const curY = new Date().getFullYear();
        const startYear = curY - (this.config.AllowPastDateTime ? 80 : 0);
        const endYear = curY + 20;
        
        let yearOptions = '';
        for (let y = startYear; y <= endYear; y++) {
            yearOptions += `<option value="${y}">${y}</option>`;
        }
        ySelect.innerHTML = yearOptions;

        this.boundHandlers.monthChange = () => {
            this.viewDate.setMonth(parseInt(mSelect.value));
            this.renderCalendar();
        };
        this.boundHandlers.yearChange = () => {
            this.viewDate.setFullYear(parseInt(ySelect.value));
            this.renderCalendar();
        };
        
        mSelect.addEventListener('change', this.boundHandlers.monthChange);
        ySelect.addEventListener('change', this.boundHandlers.yearChange);
    }

    renderCalendar() {
        if (this.config.PickTimeOnly) return; // Don't render calendar for time-only picker
        
        const grid = this.elements.daysGrid;
        if (!grid) return;
        
        const year = this.viewDate.getFullYear();
        const month = this.viewDate.getMonth();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const mSelect = this.elements.monthSelect;
        const ySelect = this.elements.yearSelect;
        mSelect.value = month;
        ySelect.value = year;

        const firstDay = new Date(year, month, 1).getDay();
        const lastDay = new Date(year, month + 1, 0).getDate();

        let html = `
            <div class="day-name">S</div>
            <div class="day-name">M</div>
            <div class="day-name">T</div>
            <div class="day-name">W</div>
            <div class="day-name">T</div>
            <div class="day-name">F</div>
            <div class="day-name">S</div>
        `;

        // Add empty cells for days before month starts
        for (let i = 0; i < firstDay; i++) {
            html += '<div class="empty"></div>';
        }

        // Add day cells
        for (let i = 1; i <= lastDay; i++) {
            const cur = new Date(year, month, i);
            cur.setHours(0, 0, 0, 0);
            
            const isSelected = this.isSameDay(cur, this.selectedDate);
            const isToday = this.isSameDay(cur, today);
            const isDisabled = !this.config.AllowPastDateTime && cur < today;
            const dateKey = this.formatDateKey(cur);
            const tabIndex = isDisabled ? '-1' : '0';
            
            html += `
                <div class="day-num ${isSelected ? 'selected' : ''} ${isToday ? 'is-today' : ''} ${isDisabled ? 'disabled' : ''}"
                     data-date="${dateKey}"
                     role="button"
                     tabindex="${tabIndex}"
                     aria-disabled="${isDisabled ? 'true' : 'false'}"
                     aria-label="Select ${cur.toLocaleDateString()}">${i}</div>
            `;
        }

        grid.innerHTML = html;
    }

    renderTimeGrid() {
        const grid = this.elements.timeGrid;
        if (!grid) {
            return;
        }
        
        const now = new Date();
        let isSelectedToday = false;
        
        // Only check if date is today if we have a date picker
        if (this.config.PickDateOnly || this.config.PickDateTimeBoth) {
            const selectedDateOnly = new Date(this.selectedDate);
            selectedDateOnly.setHours(0, 0, 0, 0);
            const todayOnly = new Date(now);
            todayOnly.setHours(0, 0, 0, 0);
            isSelectedToday = this.isSameDay(selectedDateOnly, todayOnly);
        } else if (this.config.PickTimeOnly) {
            // For time-only picker, always check if time is in past (treat as today)
            isSelectedToday = true;
        }
        
        // Find next available time after current time (or first available if all are in future)
        let firstSelectableTime = null;
        let nextAvailableTime = null;
        
        // Collect all times and find next available after current time
        this.timeSections.forEach(section => {
            section.times.forEach(t => {
                const isDisabled = !this.config.AllowPastDateTime && isSelectedToday && this.isTimeInPast(t, now);
                
                // Track first selectable time
                if (!firstSelectableTime && !isDisabled) {
                    firstSelectableTime = t;
                }
            });
        });
        
        // Find next available time after current time (only for today and first open)
        if (this.isFirstTimeOpen && isSelectedToday) {
            // Find the next time slot after current time
            for (let i = 0; i < this.allTimes.length; i++) {
                const t = this.allTimes[i];
                const isDisabled = !this.config.AllowPastDateTime && isSelectedToday && this.isTimeInPast(t, now);
                
                if (!isDisabled) {
                    // Check if this time is after current time
                    if (!this.isTimeInPast(t, now)) {
                        nextAvailableTime = t;
                        break;
                    }
                }
            }
        }
        
        // Use next available time if found, otherwise use first selectable
        const timeToSelect = nextAvailableTime || firstSelectableTime;
        
        // Auto-select time if needed
        if (!this.selectedTime) {
            // No time selected, select next/first available
            this.selectedTime = timeToSelect;
        } else {
            // Check if current selected time is disabled
            const currentSelectedIsDisabled = !this.config.AllowPastDateTime && 
                isSelectedToday && 
                this.isTimeInPast(this.selectedTime, now);
            
            if (currentSelectedIsDisabled && timeToSelect) {
                // Selected time is disabled, select next/first available
                this.selectedTime = timeToSelect;
            } else if (this.isFirstTimeOpen && timeToSelect) {
                // First time opening modal - select next available time after current time
                this.selectedTime = timeToSelect;
            }
        }
        
        // Build HTML with sections
        let html = '';
        
        this.timeSections.forEach(section => {
            if (section.times.length > 0) {
                html += `<div class="time-section-group">
                    <div class="time-section-label">${section.label}</div>
                    <div class="time-section-chips">`;
                
                section.times.forEach(t => {
                    const isDisabled = !this.config.AllowPastDateTime && isSelectedToday && this.isTimeInPast(t, now);
                    const isSelected = t === this.selectedTime && !isDisabled;
                    
                    html += `<div class="time-chip ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}" role="button" tabindex="${isDisabled ? '-1' : '0'}" aria-label="Select ${t}" ${isDisabled ? 'aria-disabled="true"' : ''} data-time="${t}">${t}</div>`;
                });
                
                html += `</div></div>`;
            }
        });
        
        grid.innerHTML = html;

        const selectedChip = grid.querySelector('.time-chip.selected');
        // Scroll to selected time chip (only scroll within time grid, not page)
        if (selectedChip) {
            const timeGrid = grid;
            if (timeGrid) {
                // Use setTimeout to ensure DOM is fully rendered
                setTimeout(() => {
                    const chipOffset = selectedChip.offsetTop;
                    const gridHeight = timeGrid.clientHeight;
                    const chipHeight = selectedChip.offsetHeight;
                    
                    timeGrid.scrollTo({
                        top: chipOffset - (gridHeight / 2) + (chipHeight / 2),
                        behavior: 'smooth'
                    });
                }, 0);
            }
        }
    }
    
    isTimeInPast(timeStr, now) {
        // Parse time string like "8:00 AM" or "3:00 PM" or "12:00 PM"
        const [time, period] = timeStr.split(' ');
        const [hours, minutes] = time.split(':').map(Number);
        let hour24 = hours;
        
        // Convert 12-hour to 24-hour format
        if (period === 'PM') {
            if (hours === 12) {
                hour24 = 12; // 12:00 PM = 12:00
            } else {
                hour24 = hours + 12; // 3:00 PM = 15:00
            }
        } else if (period === 'AM') {
            if (hours === 12) {
                hour24 = 0; // 12:00 AM = 00:00
            } else {
                hour24 = hours; // 8:00 AM = 08:00
            }
        }
        
        // Create a date with the same date as 'now' but with the parsed time
        const timeDate = new Date(now);
        timeDate.setHours(hour24, minutes, 0, 0);
        
        // Compare if this time is in the past
        return timeDate < now;
    }
    

    renderShortcuts() {
        // Shortcuts section removed - buttons moved to header
    }
    
    apply() {
        let output = '';
        
        if (this.config.PickTimeOnly) {
            // Time only
            output = this.selectedTime;
        } else if (this.config.PickDateOnly) {
            // Date only
            output = this.selectedDate.toLocaleDateString('en-GB');
        } else {
            // Both date and time (default or PickDateTimeBoth)
            const dateStr = this.selectedDate.toLocaleDateString('en-GB');
            output = `${dateStr} ${this.selectedTime}`;
        }
        
        this.input.value = output;
        this.modal.classList.remove('active');
        
        // Dispatch custom event
        const event = new CustomEvent('dateSelected', {
            detail: {
                date: (this.config.PickDateOnly || this.config.PickDateTimeBoth) ? new Date(this.selectedDate) : null,
                time: (this.config.PickTimeOnly || this.config.PickDateTimeBoth) ? this.selectedTime : null,
                formatted: this.input.value
            }
        });
        this.input.dispatchEvent(event);
    }

    isSameDay(d1, d2) {
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
    }
    
    // Cleanup method for removing event listeners
    destroy() {
        if (this.boundHandlers) {
            this.input.removeEventListener('click', this.boundHandlers.inputClick);
            this.modal.removeEventListener('click', this.boundHandlers.modalClick);
            window.removeEventListener('click', this.boundHandlers.windowClick);
            if (this.boundHandlers.reposition) {
                window.removeEventListener('resize', this.boundHandlers.reposition);
                window.removeEventListener('scroll', this.boundHandlers.reposition, true);
            }
            if (this.elements?.daysGrid && this.boundHandlers.dayClick) {
                this.elements.daysGrid.removeEventListener('click', this.boundHandlers.dayClick);
                this.elements.daysGrid.removeEventListener('keydown', this.boundHandlers.dayKeydown);
            }
            if (this.elements?.timeGrid && this.boundHandlers.timeClick) {
                this.elements.timeGrid.removeEventListener('click', this.boundHandlers.timeClick);
                this.elements.timeGrid.removeEventListener('keydown', this.boundHandlers.timeKeydown);
            }
            
            // Action buttons are now in shortcuts section
            const clearBtn = this.modal.querySelector('.btn-clear');
            const todayBtn = this.modal.querySelector('.btn-today');
            const setBtn = this.modal.querySelector('.btn-apply');
            const prevBtn = this.modal.querySelector('.prev-m');
            const nextBtn = this.modal.querySelector('.next-m');
            const mSelect = this.modal.querySelector('.month-select');
            const ySelect = this.modal.querySelector('.year-select');
            
            if (clearBtn && this.boundHandlers.clear) clearBtn.removeEventListener('click', this.boundHandlers.clear);
            if (todayBtn && this.boundHandlers.today) todayBtn.removeEventListener('click', this.boundHandlers.today);
            const applyBtn = this.modal.querySelector('.btn-apply');
            if (applyBtn && this.boundHandlers.set) applyBtn.removeEventListener('click', this.boundHandlers.set);
            if (prevBtn && this.boundHandlers.prevMonth) prevBtn.removeEventListener('click', this.boundHandlers.prevMonth);
            if (nextBtn && this.boundHandlers.nextMonth) nextBtn.removeEventListener('click', this.boundHandlers.nextMonth);
            if (mSelect && this.boundHandlers.monthChange) mSelect.removeEventListener('change', this.boundHandlers.monthChange);
            if (ySelect && this.boundHandlers.yearChange) ySelect.removeEventListener('change', this.boundHandlers.yearChange);
        }
        
        if (this.modal && this.modal.parentNode) {
            this.modal.parentNode.removeChild(this.modal);
        }
    }
}