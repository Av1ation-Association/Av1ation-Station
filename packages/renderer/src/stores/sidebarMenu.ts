import { defineStore } from 'pinia';

export const useSidebarMenuStore = defineStore('sidebarMenu', {
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
