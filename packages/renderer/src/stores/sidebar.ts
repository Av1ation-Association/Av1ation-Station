import { defineStore } from 'pinia';

export const useSidebarStore = defineStore('sidebarMenu', {
    state: () => {
        return {
            sidebarCollapsed: false,
        };
    },
    actions: {
        toggleSidebar() {
            this.sidebarCollapsed = !this.sidebarCollapsed;
        },
    },
});
