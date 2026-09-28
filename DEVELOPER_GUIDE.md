# 🛠 Developer Guide for NestJS API

This guide explains the standards, structure, and best practices for developing in this project.  
Follow these rules strictly to keep the codebase clean, scalable, and maintainable.

---

## 📂 Project Structure

```
src/
└── {feature-module}/
    ├── dto/                       # Data Transfer Objects
    ├── entities/                  # TypeORM entities
    ├── controllers/{feature}.controller.ts
    ├── services/{feature}.service.ts
    ├── {feature}.module.ts
    ├── {feature}.repository.ts    # (optional)

 test/{feature}.e2e-spec.ts  # e2e tests
```

---

## 🚀 Development Rules

### 1. **Modular Design**
- Organize code by domain (feature modules).
- Each module must contain a controller, service, entity, and dto.
- Keep modules focused on a single business domain.

### 2. **Controllers**
- **Thin controllers only**: no business logic.
- Use decorators (`@Get`, `@Post`, etc.) to define routes.
- Call services for all business logic.
- Always return **standard API responses**.
- Handle HTTP concerns only (validation, routing, response formatting).

### 3. **Services**
- **Business logic lives here**.
- Always wrap DB/service calls in `try/catch`.
- Throw proper NestJS exceptions (`NotFoundException`, `BadRequestException`, etc.).
- Return plain objects/entities, not HTTP responses.
- If a service grows too big:
  - Split into multiple smaller services (domain-based).
  - OR move repeated logic into helpers/utils.

### 4. **Repositories (Optional)**
- Create only if queries are complex or reused.
- Expose high-level methods (`findActiveUsers()`) instead of raw queries.
- Keep repositories focused on data access patterns.

### 5. **DTOs**
- Always validate input with `class-validator`.
- Use consistent naming: `CreateUserDto`, `UpdateUserDto`, `UserResponseDto`.
- Example:
  ```ts
  export class CreateUserDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsEmail()
    email: string;

    @IsOptional()
    @IsString()
    phone?: string;
  }
  ```

### 6. **Entities**
- Represent DB tables using TypeORM.
- Include `createdAt` and `updatedAt` with `@CreateDateColumn` and `@UpdateDateColumn`.
- Use proper relationships (`@OneToMany`, `@ManyToOne`, etc.).
- Example:
  ```ts
  @Entity('users')
  export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column({ unique: true })
    email: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
  }
  ```

### 7. **Error Handling**
- Use try/catch inside services.
- Throw meaningful NestJS exceptions.
- Never return raw DB errors.
- Use custom error codes for better client handling.

---

## 📦 Standard API Response

Every API must follow this format:

### ✅ **Success Response**
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

### ❌ **Error Response**
```json
{
  "success": false,
  "errorCode": "USER_NOT_FOUND",
  "message": "User not found"
}
```

> **Use the ResponseInterceptor** (see below) to enforce this format automatically.

---

## 🔧 Response Interceptor Setup

Add this interceptor to your `app.module.ts` to automatically format all responses:

```ts
// app.module.ts
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ResponseInterceptor } from './shared/interceptors/response.interceptor';

@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    // ... other providers
  ],
})
export class AppModule {}
```

Then use the response helper in your controllers:

```ts
// users.controller.ts
import { ResponseHelper } from '../shared/helpers/response.helper';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async findAll() {
    const users = await this.usersService.findAll();
    return ResponseHelper.success(users, 'Users retrieved successfully');
  }

  @Post()
  async create(@Body() createUserDto: CreateUserDto) {
    const user = await this.usersService.create(createUserDto);
    return ResponseHelper.success(user, 'User created successfully');
  }
}
```

---

## 🧪 Testing

- We use **only e2e tests** (no unit tests).
- Naming: `{feature}.e2e-spec.ts`
- Use **Supertest** for HTTP endpoint testing.
- Cover:
  - Success cases
  - Validation errors
  - Exception cases
  - Edge cases

### Example Test:
```ts
describe('UsersController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/users (POST) -> should create a user', async () => {
    return request(app.getHttpServer())
      .post('/users')
      .send({ name: 'John Doe', email: 'john@example.com' })
      .expect(201)
      .expect(res => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.email).toBe('john@example.com');
        expect(res.body.message).toBe('User created successfully');
      });
  });

  it('/users (POST) -> should return validation error', async () => {
    return request(app.getHttpServer())
      .post('/users')
      .send({ name: '' }) // Invalid data
      .expect(400)
      .expect(res => {
        expect(res.body.success).toBe(false);
        expect(res.body.errorCode).toBe('VALIDATION_ERROR');
      });
  });
});
```

---

## 🔑 Naming Conventions

### Files:
- `users.controller.ts`
- `users.service.ts`
- `user.entity.ts`
- `create-user.dto.ts`
- `update-user.dto.ts`

### Classes:
- **PascalCase**: `UserService`, `CreateUserDto`

### Variables/Functions:
- **camelCase**: `findAllUsers`, `createUser`

### Constants:
- **UPPER_SNAKE_CASE**: `MAX_RETRY_ATTEMPTS`, `DEFAULT_PAGE_SIZE`

---

## 📝 Code Style

- Use TypeScript strict mode.
- Use async/await for all DB/service calls.
- Use dependency injection via constructor, never `new`.
- Prefer composition over inheritance.
- Keep functions small and focused (max 20-30 lines).
- Use meaningful variable and function names.

---

## ⚡ Quick Checklist Before PR

- [ ] Module structured correctly (controller, service, entity, dto).
- [ ] DTOs used with proper validation decorators.
- [ ] Controller is thin (no business logic).
- [ ] Services contain logic with proper error handling.
- [ ] API responses follow standard format.
- [ ] e2e tests cover success and error cases.
- [ ] All imports are properly organized.
- [ ] No console.log statements in production code.
- [ ] Error messages are user-friendly and meaningful.

---

## 🚨 Common Mistakes to Avoid

1. **Don't put business logic in controllers**
2. **Don't return raw database errors**
3. **Don't skip validation on DTOs**
4. **Don't forget error handling in services**
5. **Don't create overly complex services (split them)**
6. **Don't skip e2e tests for new endpoints**
7. **Don't use `any` type in TypeScript**

---

## 📚 Additional Resources

- [NestJS Documentation](https://docs.nestjs.com/)
- [TypeORM Documentation](https://typeorm.io/)
- [Class Validator](https://github.com/typestack/class-validator)
- [Supertest Documentation](https://github.com/visionmedia/supertest)

---

✅ **Follow this guide, and your code will be consistent, testable, and production-ready.**
