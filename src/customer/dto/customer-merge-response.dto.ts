import { Expose } from 'class-transformer';

export class MergeCustomerListItemDto {
    @Expose()
    id: number;

    @Expose()
    isActive: boolean;

    @Expose()
    firstName: string;

    @Expose()
    lastName: string;

    @Expose()
    email: string;

    @Expose()
    phoneNumber: string;
}

export class MergeCustomerListDataDto {
    @Expose()
    body: MergeCustomerListItemDto[];
}


