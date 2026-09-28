import { Injectable } from '@nestjs/common';
import { MergeCustomerListItemDto } from '../../dto/customer-merge-response.dto';

@Injectable()
export class MergeCustomerTransformationService {
    transformToListItem(customer: any): MergeCustomerListItemDto {

        const primaryEmail = customer.contacts?.[0]?.emails?.[0]?.email || '';
        const number = customer.contacts?.[0]?.phones?.[0]?.number || '';
        const isActive = customer.status === 2;

        return {
            id: customer.id,
            isActive,
            firstName: customer.profile?.firstname || '',
            lastName: customer.profile?.lastname || '',
            email: primaryEmail,
            phoneNumber: number,
        };
    }
}


