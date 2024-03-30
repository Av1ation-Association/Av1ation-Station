export class Queue {

    private static nextId = 0;

    public readonly id: number;
    // public readonly seasons: Season[] = [];

    constructor(public readonly name: string) {
        this.id = ++Queue.nextId;
    }

    // public get episodes() {
    //     return this.seasons.flatMap(season => season.episodes);
    // }

    // public addSeason(number: number, name?: string) {
    //     const existingSeason = this.seasons.find(season => season.number === number);

    //     if (existingSeason) {
    //         return existingSeason;
    //     }

    //     const season = new Season(this.id, number, name);
    //     this.seasons.push(new Season(this.id, number, name));

    //     return season;
    // }

    // public removeSeason(seasonId: number) {
    //     const season = this.seasons.find(season => season.id === seasonId);

    //     if (season) {
    //         this.seasons.splice(this.seasons.indexOf(season), 1);
    //     }
    // }
}